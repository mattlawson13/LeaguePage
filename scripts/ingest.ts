// Ingest layer: pulls Sleeper data into the local SQLite DB. Sleeper data is
// immutable once a week is final, so the DB is the source of truth for every
// page — nothing in app/ should call the Sleeper API directly.
//
// Usage:
//   npx tsx scripts/ingest.ts              current-season refresh (fast, gamedays-safe)
//   npx tsx scripts/ingest.ts --full        full history backfill (run once, then never)
//   npx tsx scripts/ingest.ts --players     force-refresh the ~5MB player map
//   npx tsx scripts/ingest.ts --week=3      refresh a single current-season week's matchups/transactions

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db/client";
import { sleep, sleeper } from "../lib/sleeper";
import type {
  BracketMatch,
  League,
  LeagueUser,
  Roster,
} from "../lib/sleeper";

const ROOT_LEAGUE_ID = "1316847782803296256";
const CALL_DELAY_MS = 120; // polite pacing, nowhere near Sleeper's ~1000/min cap
const PLAYERS_CACHE_PATH = path.join(process.cwd(), "data", "players.json");
const MAX_WEEKS_PER_SEASON = 18;

const now = () => new Date().toISOString();

async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const result = await fn();
  await sleep(CALL_DELAY_MS);
  return result;
}

function upsertNflState(db: ReturnType<typeof getDb>, state: Awaited<ReturnType<typeof sleeper.getNflState>>) {
  db.prepare(
    `INSERT INTO nfl_state (id, season, season_type, week, display_week, league_create_season, previous_season, fetched_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       season=excluded.season, season_type=excluded.season_type, week=excluded.week,
       display_week=excluded.display_week, league_create_season=excluded.league_create_season,
       previous_season=excluded.previous_season, fetched_at=excluded.fetched_at`,
  ).run(
    state.season,
    state.season_type,
    state.week,
    state.display_week,
    state.league_create_season,
    state.previous_season,
    now(),
  );
}

function upsertLeague(db: ReturnType<typeof getDb>, league: League) {
  db.prepare(
    `INSERT INTO leagues (league_id, season, previous_league_id, name, status, avatar, settings_json, scoring_settings_json, roster_positions_json, raw_json, fetched_at)
     VALUES (@league_id, @season, @previous_league_id, @name, @status, @avatar, @settings_json, @scoring_settings_json, @roster_positions_json, @raw_json, @fetched_at)
     ON CONFLICT(league_id) DO UPDATE SET
       season=excluded.season, previous_league_id=excluded.previous_league_id, name=excluded.name,
       status=excluded.status, avatar=excluded.avatar, settings_json=excluded.settings_json,
       scoring_settings_json=excluded.scoring_settings_json, roster_positions_json=excluded.roster_positions_json,
       raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
  ).run({
    league_id: league.league_id,
    season: league.season,
    previous_league_id: league.previous_league_id,
    name: league.name,
    status: league.status,
    avatar: league.avatar,
    settings_json: JSON.stringify(league.settings),
    scoring_settings_json: JSON.stringify(league.scoring_settings),
    roster_positions_json: JSON.stringify(league.roster_positions),
    raw_json: JSON.stringify(league),
    fetched_at: now(),
  });
}

function upsertLeagueUsers(db: ReturnType<typeof getDb>, leagueId: string, season: string, users: LeagueUser[]) {
  const insertUser = db.prepare(
    `INSERT INTO league_users (league_id, season, user_id, display_name, team_name, avatar, is_owner, raw_json, fetched_at)
     VALUES (@league_id, @season, @user_id, @display_name, @team_name, @avatar, @is_owner, @raw_json, @fetched_at)
     ON CONFLICT(league_id, user_id) DO UPDATE SET
       display_name=excluded.display_name, team_name=excluded.team_name, avatar=excluded.avatar,
       is_owner=excluded.is_owner, raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
  );
  const upsertManager = db.prepare(
    `INSERT INTO managers (user_id, display_name, avatar, first_season, last_season, fetched_at)
     VALUES (@user_id, @display_name, @avatar, @season, @season, @fetched_at)
     ON CONFLICT(user_id) DO UPDATE SET
       display_name=excluded.display_name,
       avatar=excluded.avatar,
       first_season=MIN(managers.first_season, excluded.first_season),
       last_season=MAX(managers.last_season, excluded.last_season),
       fetched_at=excluded.fetched_at`,
  );

  const tx = db.transaction((rows: LeagueUser[]) => {
    for (const u of rows) {
      insertUser.run({
        league_id: leagueId,
        season,
        user_id: u.user_id,
        display_name: u.display_name,
        team_name: u.metadata?.team_name ?? null,
        avatar: u.avatar,
        is_owner: u.is_owner ? 1 : 0,
        raw_json: JSON.stringify(u),
        fetched_at: now(),
      });
      upsertManager.run({
        user_id: u.user_id,
        display_name: u.display_name,
        avatar: u.avatar,
        season,
        fetched_at: now(),
      });
    }
  });
  tx(users);
}

function upsertRosters(db: ReturnType<typeof getDb>, leagueId: string, season: string, rosters: Roster[]) {
  const insert = db.prepare(
    `INSERT INTO rosters (league_id, season, roster_id, owner_id, co_owners_json, players_json, starters_json, reserve_json, taxi_json, wins, losses, ties, fpts, fpts_decimal, fpts_against, fpts_against_decimal, waiver_position, waiver_budget_used, raw_json, fetched_at)
     VALUES (@league_id, @season, @roster_id, @owner_id, @co_owners_json, @players_json, @starters_json, @reserve_json, @taxi_json, @wins, @losses, @ties, @fpts, @fpts_decimal, @fpts_against, @fpts_against_decimal, @waiver_position, @waiver_budget_used, @raw_json, @fetched_at)
     ON CONFLICT(league_id, roster_id) DO UPDATE SET
       owner_id=excluded.owner_id, co_owners_json=excluded.co_owners_json, players_json=excluded.players_json,
       starters_json=excluded.starters_json, reserve_json=excluded.reserve_json, taxi_json=excluded.taxi_json,
       wins=excluded.wins, losses=excluded.losses, ties=excluded.ties, fpts=excluded.fpts,
       fpts_decimal=excluded.fpts_decimal, fpts_against=excluded.fpts_against,
       fpts_against_decimal=excluded.fpts_against_decimal, waiver_position=excluded.waiver_position,
       waiver_budget_used=excluded.waiver_budget_used, raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
  );
  const tx = db.transaction((rows: Roster[]) => {
    for (const r of rows) {
      insert.run({
        league_id: leagueId,
        season,
        roster_id: r.roster_id,
        owner_id: r.owner_id,
        co_owners_json: JSON.stringify(r.co_owners ?? []),
        players_json: JSON.stringify(r.players ?? []),
        starters_json: JSON.stringify(r.starters ?? []),
        reserve_json: JSON.stringify(r.reserve ?? []),
        taxi_json: JSON.stringify(r.taxi ?? []),
        wins: r.settings?.wins ?? 0,
        losses: r.settings?.losses ?? 0,
        ties: r.settings?.ties ?? 0,
        fpts: r.settings?.fpts ?? 0,
        fpts_decimal: r.settings?.fpts_decimal ?? 0,
        fpts_against: r.settings?.fpts_against ?? 0,
        fpts_against_decimal: r.settings?.fpts_against_decimal ?? 0,
        waiver_position: r.settings?.waiver_position ?? null,
        waiver_budget_used: r.settings?.waiver_budget_used ?? null,
        raw_json: JSON.stringify(r),
        fetched_at: now(),
      });
    }
  });
  tx(rosters);
}

async function ingestMatchupWeek(db: ReturnType<typeof getDb>, leagueId: string, season: string, week: number) {
  const matchups = await paced(() => sleeper.getMatchups(leagueId, week));
  if (matchups.length === 0) return false;
  const insert = db.prepare(
    `INSERT INTO matchups (league_id, season, week, roster_id, matchup_id, points, custom_points, players_json, starters_json, players_points_json, raw_json, fetched_at)
     VALUES (@league_id, @season, @week, @roster_id, @matchup_id, @points, @custom_points, @players_json, @starters_json, @players_points_json, @raw_json, @fetched_at)
     ON CONFLICT(league_id, week, roster_id) DO UPDATE SET
       matchup_id=excluded.matchup_id, points=excluded.points, custom_points=excluded.custom_points,
       players_json=excluded.players_json, starters_json=excluded.starters_json,
       players_points_json=excluded.players_points_json, raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
  );
  const tx = db.transaction(() => {
    for (const m of matchups) {
      insert.run({
        league_id: leagueId,
        season,
        week,
        roster_id: m.roster_id,
        matchup_id: m.matchup_id,
        points: m.points,
        custom_points: m.custom_points,
        players_json: JSON.stringify(m.players ?? []),
        starters_json: JSON.stringify(m.starters ?? []),
        players_points_json: JSON.stringify(m.players_points ?? {}),
        raw_json: JSON.stringify(m),
        fetched_at: now(),
      });
    }
  });
  tx();
  return true;
}

async function ingestTransactionWeek(db: ReturnType<typeof getDb>, leagueId: string, season: string, week: number) {
  const txns = await paced(() => sleeper.getTransactions(leagueId, week));
  if (txns.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO transactions (transaction_id, league_id, season, week, type, status, creator, created, roster_ids_json, adds_json, drops_json, draft_picks_json, waiver_budget_json, raw_json, fetched_at)
     VALUES (@transaction_id, @league_id, @season, @week, @type, @status, @creator, @created, @roster_ids_json, @adds_json, @drops_json, @draft_picks_json, @waiver_budget_json, @raw_json, @fetched_at)
     ON CONFLICT(transaction_id) DO UPDATE SET
       type=excluded.type, status=excluded.status, creator=excluded.creator, created=excluded.created,
       roster_ids_json=excluded.roster_ids_json, adds_json=excluded.adds_json, drops_json=excluded.drops_json,
       draft_picks_json=excluded.draft_picks_json, waiver_budget_json=excluded.waiver_budget_json,
       raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
  );
  const tx = db.transaction(() => {
    for (const t of txns) {
      insert.run({
        transaction_id: t.transaction_id,
        league_id: leagueId,
        season,
        week,
        type: t.type,
        status: t.status,
        creator: t.creator,
        created: t.created,
        roster_ids_json: JSON.stringify(t.roster_ids ?? []),
        adds_json: JSON.stringify(t.adds ?? {}),
        drops_json: JSON.stringify(t.drops ?? {}),
        draft_picks_json: JSON.stringify(t.draft_picks ?? []),
        waiver_budget_json: JSON.stringify(t.waiver_budget ?? []),
        raw_json: JSON.stringify(t),
        fetched_at: now(),
      });
    }
  });
  tx();
}

async function ingestBrackets(db: ReturnType<typeof getDb>, leagueId: string, season: string) {
  const [winners, losers] = await Promise.all([
    paced(() => sleeper.getWinnersBracket(leagueId)),
    paced(() => sleeper.getLosersBracket(leagueId)),
  ]);
  const insert = db.prepare(
    `INSERT INTO brackets (league_id, season, type, data_json, fetched_at)
     VALUES (@league_id, @season, @type, @data_json, @fetched_at)
     ON CONFLICT(league_id, type) DO UPDATE SET data_json=excluded.data_json, fetched_at=excluded.fetched_at`,
  );
  const store = (type: "winners" | "losers", data: BracketMatch[]) => {
    if (data.length === 0) return;
    insert.run({ league_id: leagueId, season, type, data_json: JSON.stringify(data), fetched_at: now() });
  };
  store("winners", winners);
  store("losers", losers);
}

async function ingestTradedPicks(db: ReturnType<typeof getDb>, leagueId: string, season: string) {
  const picks = await paced(() => sleeper.getTradedPicks(leagueId));
  if (picks.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO traded_picks (league_id, season, pick_season, round, roster_id, owner_id, previous_owner_id, fetched_at)
     VALUES (@league_id, @season, @pick_season, @round, @roster_id, @owner_id, @previous_owner_id, @fetched_at)
     ON CONFLICT(league_id, pick_season, round, roster_id) DO UPDATE SET
       owner_id=excluded.owner_id, previous_owner_id=excluded.previous_owner_id, fetched_at=excluded.fetched_at`,
  );
  const tx = db.transaction(() => {
    for (const p of picks) {
      insert.run({
        league_id: leagueId,
        season,
        pick_season: p.season,
        round: p.round,
        roster_id: p.roster_id,
        owner_id: p.owner_id,
        previous_owner_id: p.previous_owner_id,
        fetched_at: now(),
      });
    }
  });
  tx();
}

async function ingestDraftsAndPicks(db: ReturnType<typeof getDb>, leagueId: string, season: string) {
  const drafts = await paced(() => sleeper.getDrafts(leagueId));
  const insertDraft = db.prepare(
    `INSERT INTO drafts (draft_id, league_id, season, status, type, start_time, settings_json, draft_order_json, slot_to_roster_id_json, raw_json, fetched_at)
     VALUES (@draft_id, @league_id, @season, @status, @type, @start_time, @settings_json, @draft_order_json, @slot_to_roster_id_json, @raw_json, @fetched_at)
     ON CONFLICT(draft_id) DO UPDATE SET
       status=excluded.status, type=excluded.type, start_time=excluded.start_time,
       settings_json=excluded.settings_json, draft_order_json=excluded.draft_order_json,
       slot_to_roster_id_json=excluded.slot_to_roster_id_json, raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
  );
  const insertPick = db.prepare(
    `INSERT INTO draft_picks (draft_id, pick_no, round, draft_slot, roster_id, player_id, picked_by, is_keeper, metadata_json, fetched_at)
     VALUES (@draft_id, @pick_no, @round, @draft_slot, @roster_id, @player_id, @picked_by, @is_keeper, @metadata_json, @fetched_at)
     ON CONFLICT(draft_id, pick_no) DO UPDATE SET
       round=excluded.round, draft_slot=excluded.draft_slot, roster_id=excluded.roster_id,
       player_id=excluded.player_id, picked_by=excluded.picked_by, is_keeper=excluded.is_keeper,
       metadata_json=excluded.metadata_json, fetched_at=excluded.fetched_at`,
  );

  for (const d of drafts) {
    insertDraft.run({
      draft_id: d.draft_id,
      league_id: leagueId,
      season,
      status: d.status,
      type: d.type,
      start_time: d.start_time,
      settings_json: JSON.stringify(d.settings ?? {}),
      draft_order_json: JSON.stringify(d.draft_order ?? {}),
      slot_to_roster_id_json: JSON.stringify(d.slot_to_roster_id ?? {}),
      raw_json: JSON.stringify(d),
      fetched_at: now(),
    });

    const picks = await paced(() => sleeper.getDraftPicks(d.draft_id));
    const tx = db.transaction(() => {
      for (const p of picks) {
        insertPick.run({
          draft_id: d.draft_id,
          pick_no: p.pick_no,
          round: p.round,
          draft_slot: p.draft_slot,
          roster_id: p.roster_id,
          player_id: p.player_id,
          picked_by: p.picked_by,
          is_keeper: p.is_keeper ? 1 : 0,
          metadata_json: JSON.stringify(p.metadata ?? {}),
          fetched_at: now(),
        });
      }
    });
    tx();
  }
}

async function ingestPlayers(db: ReturnType<typeof getDb>, force: boolean) {
  const meta = db.prepare(`SELECT last_fetched_at FROM ingest_meta WHERE key = 'players'`).get() as
    | { last_fetched_at: string }
    | undefined;
  const staleMs = 24 * 60 * 60 * 1000;
  if (!force && meta && Date.now() - new Date(meta.last_fetched_at).getTime() < staleMs) {
    console.log("players: cache fresh (<24h), skipping");
    return;
  }

  console.log("players: fetching full player map (~5MB, this takes a bit)...");
  const players = await sleeper.getAllPlayers();

  fs.mkdirSync(path.dirname(PLAYERS_CACHE_PATH), { recursive: true });
  fs.writeFileSync(PLAYERS_CACHE_PATH, JSON.stringify(players));

  const insert = db.prepare(
    `INSERT INTO players (player_id, full_name, search_full_name, position, team, status, injury_status, active, raw_json, fetched_at)
     VALUES (@player_id, @full_name, @search_full_name, @position, @team, @status, @injury_status, @active, @raw_json, @fetched_at)
     ON CONFLICT(player_id) DO UPDATE SET
       full_name=excluded.full_name, search_full_name=excluded.search_full_name, position=excluded.position,
       team=excluded.team, status=excluded.status, injury_status=excluded.injury_status, active=excluded.active,
       raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
  );
  const fetchedAt = now();
  const tx = db.transaction(() => {
    for (const p of Object.values(players)) {
      if (!p || !p.player_id) continue;
      insert.run({
        player_id: p.player_id,
        full_name: p.full_name,
        search_full_name: p.search_full_name,
        position: p.position,
        team: p.team,
        status: p.status,
        injury_status: p.injury_status,
        active: p.active ? 1 : 0,
        raw_json: JSON.stringify(p),
        fetched_at: fetchedAt,
      });
    }
  });
  tx();

  db.prepare(
    `INSERT INTO ingest_meta (key, last_fetched_at) VALUES ('players', ?)
     ON CONFLICT(key) DO UPDATE SET last_fetched_at=excluded.last_fetched_at`,
  ).run(fetchedAt);
  console.log(`players: stored ${Object.keys(players).length} players`);
}

async function ingestTrending(db: ReturnType<typeof getDb>) {
  const [adds, drops] = await Promise.all([
    paced(() => sleeper.getTrending("add", 25)),
    paced(() => sleeper.getTrending("drop", 25)),
  ]);
  const insert = db.prepare(
    `INSERT INTO trending (type, player_id, count, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(type, player_id, fetched_at) DO NOTHING`,
  );
  const fetchedAt = now();
  const tx = db.transaction(() => {
    for (const a of adds) insert.run("add", a.player_id, a.count, fetchedAt);
    for (const d of drops) insert.run("drop", d.player_id, d.count, fetchedAt);
  });
  tx();
}

/** One season's full ingest: league, users, rosters, matchups, transactions, brackets, picks, draft. */
async function ingestSeason(db: ReturnType<typeof getDb>, leagueId: string, maxWeek: number) {
  const league = await paced(() => sleeper.getLeague(leagueId));
  upsertLeague(db, league);
  console.log(`season ${league.season} (${leagueId}): league + settings stored`);

  const [users, rosters] = await Promise.all([
    paced(() => sleeper.getLeagueUsers(leagueId)),
    paced(() => sleeper.getRosters(leagueId)),
  ]);
  upsertLeagueUsers(db, leagueId, league.season, users);
  upsertRosters(db, leagueId, league.season, rosters);
  console.log(`season ${league.season}: ${users.length} users, ${rosters.length} rosters`);

  let weeksWithData = 0;
  for (let week = 1; week <= maxWeek; week++) {
    const hadData = await ingestMatchupWeek(db, leagueId, league.season, week);
    if (hadData) weeksWithData++;
    await ingestTransactionWeek(db, leagueId, league.season, week);
  }
  console.log(`season ${league.season}: matchups/transactions stored through week ${weeksWithData}`);

  await ingestBrackets(db, leagueId, league.season);
  await ingestTradedPicks(db, leagueId, league.season);
  await ingestDraftsAndPicks(db, leagueId, league.season);
  console.log(`season ${league.season}: brackets, traded picks, draft stored`);

  return league;
}

async function ingestCurrent(db: ReturnType<typeof getDb>) {
  const state = await sleeper.getNflState();
  upsertNflState(db, state);

  const currentWeek = state.display_week || state.week || 1;
  await ingestSeason(db, ROOT_LEAGUE_ID, currentWeek);
  await ingestTrending(db);
  await ingestPlayers(db, false);
}

async function ingestFullHistory(db: ReturnType<typeof getDb>) {
  const state = await sleeper.getNflState();
  upsertNflState(db, state);

  let leagueId: string | null = ROOT_LEAGUE_ID;
  let isCurrent = true;
  const seasonsSeen: string[] = [];

  while (leagueId) {
    const maxWeek = isCurrent ? state.display_week || state.week || 1 : MAX_WEEKS_PER_SEASON;
    const league = await ingestSeason(db, leagueId, maxWeek);
    seasonsSeen.push(league.season);
    leagueId = league.previous_league_id;
    isCurrent = false;
  }

  console.log(`full backfill complete: seasons ${seasonsSeen.reverse().join(", ")}`);

  await ingestTrending(db);
  await ingestPlayers(db, false);
}

async function main() {
  const args = process.argv.slice(2);
  const db = getDb();

  if (args.includes("--players")) {
    await ingestPlayers(db, true);
    return;
  }

  const weekArg = args.find((a) => a.startsWith("--week="));
  if (weekArg) {
    const week = Number(weekArg.split("=")[1]);
    const state = await sleeper.getNflState();
    upsertNflState(db, state);
    const league = await paced(() => sleeper.getLeague(ROOT_LEAGUE_ID));
    upsertLeague(db, league);
    await ingestMatchupWeek(db, ROOT_LEAGUE_ID, league.season, week);
    await ingestTransactionWeek(db, ROOT_LEAGUE_ID, league.season, week);
    console.log(`week ${week}: refreshed`);
    return;
  }

  if (args.includes("--full")) {
    await ingestFullHistory(db);
    return;
  }

  await ingestCurrent(db);
}

main()
  .then(() => {
    console.log("ingest: done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("ingest: failed", err);
    process.exit(1);
  });
