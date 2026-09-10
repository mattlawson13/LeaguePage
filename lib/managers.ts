import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentLeague } from "./league";
import { getHeadToHeadForPair, getLeagues, getManagerCareerStats, type HeadToHeadForUser } from "./stats";
import { ordinal } from "./format";
import managersFile from "../data/managers.json";

export interface ManagerRelationship {
  type: string;
  with: string;
}

export interface ManagerContent {
  sleeper_username: string;
  display_name: string;
  real_name: string;
  role: string;
  bio: string;
  favorite_player: string | null;
  favorite_team: string | null;
  relationship?: ManagerRelationship;
  rivals: string[];
}

export interface ResolvedManager extends ManagerContent {
  userId: string;
  avatar: string | null;
}

function normalizeUsername(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Resolves every data/managers.json entry to a real Sleeper user_id by
 * matching sleeper_username against the current league's actual display_name
 * (case-insensitive, trimmed) — nothing fuzzier. Sleeper display names can
 * contain spaces and change over time, so this WILL eventually drift from
 * the hand-written JSON; when it does, this throws with the full unmatched
 * list rather than silently dropping a manager from the site.
 */
export function resolveManagers(db: Database = getDb()): ResolvedManager[] {
  const league = getCurrentLeague(db);
  if (!league) {
    throw new Error("resolveManagers: no league ingested yet — run the ingest script first.");
  }

  const users = db
    .prepare(`SELECT user_id, display_name, avatar FROM league_users WHERE league_id = ?`)
    .all(league.league_id) as { user_id: string; display_name: string; avatar: string | null }[];

  const byNormalizedName = new Map(users.map((u) => [normalizeUsername(u.display_name), u]));

  const content = managersFile.managers as ManagerContent[];
  const resolved: ResolvedManager[] = [];
  const unmatched: string[] = [];

  for (const m of content) {
    const match = byNormalizedName.get(normalizeUsername(m.sleeper_username));
    if (!match) {
      unmatched.push(m.sleeper_username);
      continue;
    }
    resolved.push({ ...m, userId: match.user_id, avatar: match.avatar });
  }

  if (unmatched.length > 0) {
    const realNames = users.map((u) => u.display_name).sort((a, b) => a.localeCompare(b));
    throw new Error(
      `resolveManagers: ${unmatched.length} manager(s) in data/managers.json failed to resolve to a Sleeper user_id.\n` +
        `Unmatched sleeper_username values: ${unmatched.map((n) => `"${n}"`).join(", ")}\n` +
        `These must match a current league display_name exactly (case-insensitive, trimmed) — team names and old ` +
        `display names don't count.\n` +
        `Real current display_name values in this league: ${realNames.join(", ")}`,
    );
  }

  validateRivalMutuality(resolved);

  return resolved;
}

function validateRivalMutuality(managers: ResolvedManager[]) {
  const byUsername = new Map(managers.map((m) => [normalizeUsername(m.sleeper_username), m]));
  for (const m of managers) {
    for (const rivalUsername of m.rivals) {
      if (normalizeUsername(rivalUsername) === normalizeUsername(m.sleeper_username)) continue; // self-rivalry, not a pair
      const rival = byUsername.get(normalizeUsername(rivalUsername));
      if (!rival) {
        console.warn(`[managers] "${m.sleeper_username}" lists rival "${rivalUsername}", which doesn't match any manager.`);
        continue;
      }
      const isMutual = rival.rivals.some((r) => normalizeUsername(r) === normalizeUsername(m.sleeper_username));
      if (!isMutual) {
        console.warn(
          `[managers] One-sided rivalry: "${m.sleeper_username}" lists "${rival.sleeper_username}", but not vice versa.`,
        );
      }
    }
  }
}

export function getManagerByUsername(username: string, db: Database = getDb()): ResolvedManager | null {
  const all = resolveManagers(db);
  const target = normalizeUsername(decodeURIComponent(username));
  return all.find((m) => normalizeUsername(m.sleeper_username) === target) ?? null;
}

/** Sleeper usernames can contain spaces, so always route through this rather than a raw template string. */
export function managerHref(username: string): string {
  return `/managers/${encodeURIComponent(username)}`;
}

// --- Step 3: all-time record ---------------------------------------------

interface BracketMatch {
  m: number;
  r: number;
  p?: number;
  w: number | null;
  l: number | null;
  t1: number | null;
  t2: number | null;
}

/**
 * Per-season placement (1..N) for every roster. Playoff qualifiers get an
 * exact placement from the winners bracket's p-tagged matches (p=X: winner
 * -> place X, loser -> place X+1). Non-qualifiers are ranked by regular
 * season record among themselves, offset past the last playoff spot — the
 * losers bracket's own internal win/loss polarity isn't standardized enough
 * across seasons to trust for exact placement, so this is a deliberate,
 * documented approximation rather than a guess dressed up as fact.
 */
export function getSeasonFinishes(leagueId: string, db: Database): { finishes: Map<number, number>; playoffTeams: number } {
  const finishes = new Map<number, number>();
  const qualified = new Set<number>();

  const winnersRow = db
    .prepare(`SELECT data_json FROM brackets WHERE league_id = ? AND type = 'winners'`)
    .get(leagueId) as { data_json: string } | undefined;

  if (winnersRow) {
    const matches = JSON.parse(winnersRow.data_json) as BracketMatch[];
    // Top seeds get a first-round bye, so they only appear as t1/t2 starting
    // in round 2 — collecting from every round (not just r===1) is required
    // to catch them, since a completed season has every slot fully resolved.
    for (const match of matches) {
      if (match.t1) qualified.add(match.t1);
      if (match.t2) qualified.add(match.t2);
    }
    for (const match of matches) {
      if (match.p === 1) {
        if (match.w) finishes.set(match.w, 1);
        if (match.l) finishes.set(match.l, 2);
      } else if (match.p === 3) {
        if (match.w) finishes.set(match.w, 3);
        if (match.l) finishes.set(match.l, 4);
      } else if (match.p === 5) {
        if (match.w) finishes.set(match.w, 5);
        if (match.l) finishes.set(match.l, 6);
      }
    }
  }

  const playoffTeams = qualified.size;

  const rosters = db
    .prepare(`SELECT roster_id, wins, fpts, fpts_decimal FROM rosters WHERE league_id = ?`)
    .all(leagueId) as { roster_id: number; wins: number; fpts: number; fpts_decimal: number }[];

  const nonQualifiers = rosters
    .filter((r) => !qualified.has(r.roster_id))
    .sort((a, b) => b.wins - a.wins || b.fpts + b.fpts_decimal / 100 - (a.fpts + a.fpts_decimal / 100));
  nonQualifiers.forEach((r, i) => finishes.set(r.roster_id, playoffTeams + i + 1));

  return { finishes, playoffTeams };
}

export interface AllTimeRecord {
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  playoffWins: number;
  playoffLosses: number;
  pf: number;
  pa: number;
  diff: number;
  avgPpg: number;
  seasonsPlayed: number;
  championships: number;
  runnerUps: number;
  lastPlaceFinishes: number;
  bestWeek: { season: string; week: number; points: number } | null;
  worstWeek: { season: string; week: number; points: number } | null;
  bestSeasonFinish: number | null;
  worstSeasonFinish: number | null;
}

export function getAllTimeRecord(userId: string, db: Database = getDb()): AllTimeRecord {
  const career = getManagerCareerStats(db).find((c) => c.userId === userId);
  const leagues = getLeagues(db).filter((l) => l.status === "complete");

  let playoffWins = 0;
  let playoffLosses = 0;
  let runnerUps = 0;
  let bestSeasonFinish: number | null = null;
  let worstSeasonFinish: number | null = null;

  for (const league of leagues) {
    const roster = db
      .prepare(`SELECT roster_id FROM rosters WHERE league_id = ? AND owner_id = ?`)
      .get(league.league_id, userId) as { roster_id: number } | undefined;
    if (!roster) continue;

    const winnersRow = db
      .prepare(`SELECT data_json FROM brackets WHERE league_id = ? AND type = 'winners'`)
      .get(league.league_id) as { data_json: string } | undefined;
    if (winnersRow) {
      const matches = JSON.parse(winnersRow.data_json) as BracketMatch[];
      for (const match of matches) {
        if (match.w === roster.roster_id) playoffWins++;
        if (match.l === roster.roster_id) playoffLosses++;
        if (match.p === 1 && match.l === roster.roster_id) runnerUps++;
      }
    }

    const { finishes } = getSeasonFinishes(league.league_id, db);
    const finish = finishes.get(roster.roster_id) ?? null;
    if (finish !== null) {
      if (bestSeasonFinish === null || finish < bestSeasonFinish) bestSeasonFinish = finish;
      if (worstSeasonFinish === null || finish > worstSeasonFinish) worstSeasonFinish = finish;
    }
  }

  const gamesPlayed = career?.gamesPlayed ?? 0;

  return {
    wins: career?.wins ?? 0,
    losses: career?.losses ?? 0,
    ties: career?.ties ?? 0,
    winPct: gamesPlayed > 0 ? (career!.wins + career!.ties * 0.5) / gamesPlayed : 0,
    playoffWins,
    playoffLosses,
    pf: career?.pf ?? 0,
    pa: career?.pa ?? 0,
    diff: (career?.pf ?? 0) - (career?.pa ?? 0),
    avgPpg: career?.avgPf ?? 0,
    seasonsPlayed: career?.seasons.length ?? 0,
    championships: career?.titles ?? 0,
    runnerUps,
    lastPlaceFinishes: career?.lastPlaceFinishes ?? 0,
    bestWeek: career?.bestWeek ?? null,
    worstWeek: career?.worstWeek ?? null,
    bestSeasonFinish,
    worstSeasonFinish,
  };
}

// --- Step 5.6: career table (season by season) ---------------------------

export interface SeasonHistoryRow {
  season: string;
  record: string;
  pf: number;
  pa: number;
  finish: number | null;
  result: string;
}

function finishToResult(finish: number | null, playoffTeams: number): string {
  if (finish === null) return "—";
  if (finish === 1) return "Champion";
  if (finish === 2) return "Runner-up";
  if (finish <= playoffTeams) return `${ordinal(finish)} Place`;
  return "Missed Playoffs";
}

export function getManagerSeasonHistory(userId: string, db: Database = getDb()): SeasonHistoryRow[] {
  const leagues = getLeagues(db)
    .filter((l) => l.status === "complete")
    .sort((a, b) => a.season.localeCompare(b.season));

  const rows: SeasonHistoryRow[] = [];
  for (const league of leagues) {
    const roster = db
      .prepare(
        `SELECT roster_id, wins, losses, ties, fpts, fpts_decimal, fpts_against, fpts_against_decimal FROM rosters WHERE league_id = ? AND owner_id = ?`,
      )
      .get(league.league_id, userId) as
      | {
          roster_id: number;
          wins: number;
          losses: number;
          ties: number;
          fpts: number;
          fpts_decimal: number;
          fpts_against: number;
          fpts_against_decimal: number;
        }
      | undefined;
    if (!roster) continue;

    const { finishes, playoffTeams } = getSeasonFinishes(league.league_id, db);
    const finish = finishes.get(roster.roster_id) ?? null;

    rows.push({
      season: league.season,
      record: roster.ties > 0 ? `${roster.wins}-${roster.losses}-${roster.ties}` : `${roster.wins}-${roster.losses}`,
      pf: roster.fpts + roster.fpts_decimal / 100,
      pa: roster.fpts_against + roster.fpts_against_decimal / 100,
      finish,
      result: finishToResult(finish, playoffTeams),
    });
  }
  return rows;
}

// --- Step 5.7: current roster ---------------------------------------------

export interface RosterPlayerRow {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

export function getManagerCurrentRoster(userId: string, db: Database = getDb()): RosterPlayerRow[] {
  const league = getCurrentLeague(db);
  if (!league) return [];

  const roster = db
    .prepare(`SELECT players_json FROM rosters WHERE league_id = ? AND owner_id = ?`)
    .get(league.league_id, userId) as { players_json: string } | undefined;
  if (!roster) return [];

  const playerIds = JSON.parse(roster.players_json) as string[];
  if (playerIds.length === 0) return [];

  const placeholders = playerIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT player_id, full_name, position, team FROM players WHERE player_id IN (${placeholders})`)
    .all(...playerIds) as { player_id: string; full_name: string | null; position: string | null; team: string | null }[];

  const byId = new Map(rows.map((r) => [r.player_id, r]));
  const positionOrder = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];

  return playerIds
    .map((id) => {
      const p = byId.get(id);
      return { playerId: id, name: p?.full_name ?? id, position: p?.position ?? "—", team: p?.team ?? null };
    })
    .sort((a, b) => {
      const ai = positionOrder.indexOf(a.position);
      const bi = positionOrder.indexOf(b.position);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
}

// --- Step 5.8: draft tendencies --------------------------------------------

export interface DraftTendencies {
  avgPickByRound: { round: number; avgPick: number }[];
  mostDrafted: { playerId: string; name: string; count: number } | null;
}

export function getManagerDraftTendencies(userId: string, db: Database = getDb()): DraftTendencies {
  const picks = db
    .prepare(`SELECT round, pick_no, player_id FROM draft_picks WHERE picked_by = ?`)
    .all(userId) as { round: number; pick_no: number; player_id: string }[];

  const byRound = new Map<number, number[]>();
  const playerCounts = new Map<string, number>();
  for (const p of picks) {
    if (!byRound.has(p.round)) byRound.set(p.round, []);
    byRound.get(p.round)!.push(p.pick_no);
    playerCounts.set(p.player_id, (playerCounts.get(p.player_id) ?? 0) + 1);
  }

  const avgPickByRound = Array.from(byRound.entries())
    .map(([round, picksInRound]) => ({
      round,
      avgPick: picksInRound.reduce((a, b) => a + b, 0) / picksInRound.length,
    }))
    .sort((a, b) => a.round - b.round);

  let mostDrafted: DraftTendencies["mostDrafted"] = null;
  let topCount = 0;
  for (const [playerId, count] of playerCounts) {
    if (count > topCount) {
      topCount = count;
      mostDrafted = { playerId, name: playerId, count };
    }
  }
  if (mostDrafted) {
    const row = db.prepare(`SELECT full_name FROM players WHERE player_id = ?`).get(mostDrafted.playerId) as
      | { full_name: string | null }
      | undefined;
    mostDrafted.name = row?.full_name ?? mostDrafted.playerId;
  }

  return { avgPickByRound, mostDrafted };
}

// --- Step 4: rivalries ------------------------------------------------

export type RivalryCard =
  | { kind: "self"; manager: ResolvedManager }
  | { kind: "normal"; rival: ResolvedManager; headToHead: HeadToHeadForUser | null; houseDivided: boolean };

/**
 * Builds the rivalry cards for one manager's bio page. Self-rivalry (a
 * manager listing themselves — the joke, not a data error) gets its own
 * card kind so the UI can special-case it. A rival username that doesn't
 * resolve to a manager is dropped with a warning rather than rendered broken
 * — validateRivalMutuality already surfaces that at resolve time.
 */
export function getManagerRivalries(manager: ResolvedManager, allManagers: ResolvedManager[], db: Database = getDb()): RivalryCard[] {
  const byUsername = new Map(allManagers.map((m) => [normalizeUsername(m.sleeper_username), m]));

  const cards: RivalryCard[] = [];
  for (const rivalUsername of manager.rivals) {
    if (normalizeUsername(rivalUsername) === normalizeUsername(manager.sleeper_username)) {
      cards.push({ kind: "self", manager });
      continue;
    }
    const rival = byUsername.get(normalizeUsername(rivalUsername));
    if (!rival) continue;

    const headToHead = getHeadToHeadForPair(manager.userId, rival.userId, db);
    const houseDivided = Boolean(
      manager.relationship && normalizeUsername(manager.relationship.with) === normalizeUsername(rival.sleeper_username),
    );
    cards.push({ kind: "normal", rival, headToHead, houseDivided });
  }
  return cards;
}
