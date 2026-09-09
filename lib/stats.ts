// Derived stats engine (spec Phase 2). Everything here reads from the local
// SQLite DB populated by scripts/ingest.ts — nothing here calls Sleeper.
import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";

export interface ManagerRow {
  user_id: string;
  display_name: string;
  avatar: string | null;
  first_season: string;
  last_season: string;
}

export interface LeagueRow {
  league_id: string;
  season: string;
  previous_league_id: string | null;
  name: string;
  status: string;
  settings_json: string;
  roster_positions_json: string;
}

interface RosterRow {
  league_id: string;
  season: string;
  roster_id: number;
  owner_id: string | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_decimal: number;
  fpts_against: number;
  fpts_against_decimal: number;
}

interface MatchupRow {
  league_id: string;
  season: string;
  week: number;
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  custom_points: number | null;
  players_json: string;
  starters_json: string;
  players_points_json: string;
}

export function getManagers(db: Database = getDb()): ManagerRow[] {
  return db
    .prepare(`SELECT user_id, display_name, avatar, first_season, last_season FROM managers ORDER BY display_name`)
    .all() as ManagerRow[];
}

export function getLeagues(db: Database = getDb()): LeagueRow[] {
  return db
    .prepare(`SELECT league_id, season, previous_league_id, name, status, settings_json, roster_positions_json FROM leagues ORDER BY season`)
    .all() as LeagueRow[];
}

function pointsOf(m: MatchupRow): number {
  if (m.custom_points !== null && m.custom_points !== undefined) return m.custom_points;
  return m.points ?? 0;
}

// --- Career / all-time manager stats -----------------------------------

export interface ManagerCareerStats {
  userId: string;
  displayName: string;
  avatar: string | null;
  seasons: string[];
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  avgPf: number;
  gamesPlayed: number;
  bestWeek: { season: string; week: number; points: number } | null;
  worstWeek: { season: string; week: number; points: number } | null;
  playoffAppearances: number;
  titles: number;
  lastPlaceFinishes: number;
}

export function getManagerCareerStats(db: Database = getDb()): ManagerCareerStats[] {
  const managers = getManagers(db);
  const rosters = db.prepare(`SELECT * FROM rosters`).all() as RosterRow[];
  const matchups = db.prepare(`SELECT * FROM matchups WHERE matchup_id IS NOT NULL`).all() as MatchupRow[];
  const leagues = getLeagues(db);

  const ownerByLeagueRoster = new Map<string, string | null>();
  for (const r of rosters) ownerByLeagueRoster.set(`${r.league_id}:${r.roster_id}`, r.owner_id);

  const byUser = new Map<string, ManagerCareerStats>();
  for (const m of managers) {
    byUser.set(m.user_id, {
      userId: m.user_id,
      displayName: m.display_name,
      avatar: m.avatar,
      seasons: [],
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
      avgPf: 0,
      gamesPlayed: 0,
      bestWeek: null,
      worstWeek: null,
      playoffAppearances: 0,
      titles: 0,
      lastPlaceFinishes: 0,
    });
  }

  // Season-long W-L-T / PF / PA come straight from Sleeper's own roster
  // aggregates — simpler and more authoritative than re-deriving from weekly
  // matchups (which would require guessing playoff vs. consolation rules).
  for (const r of rosters) {
    if (!r.owner_id) continue;
    const stats = byUser.get(r.owner_id);
    if (!stats) continue;
    if (!stats.seasons.includes(r.season)) stats.seasons.push(r.season);
    stats.wins += r.wins;
    stats.losses += r.losses;
    stats.ties += r.ties;
    stats.pf += r.fpts + r.fpts_decimal / 100;
    stats.pa += r.fpts_against + r.fpts_against_decimal / 100;
    stats.gamesPlayed += r.wins + r.losses + r.ties;
  }

  for (const stats of byUser.values()) {
    stats.avgPf = stats.gamesPlayed > 0 ? stats.pf / stats.gamesPlayed : 0;
  }

  // Best/worst individual week from raw matchup points.
  for (const m of matchups) {
    const ownerId = ownerByLeagueRoster.get(`${m.league_id}:${m.roster_id}`);
    if (!ownerId) continue;
    const stats = byUser.get(ownerId);
    if (!stats) continue;
    const pts = pointsOf(m);
    if (!stats.bestWeek || pts > stats.bestWeek.points) {
      stats.bestWeek = { season: m.season, week: m.week, points: pts };
    }
    if (!stats.worstWeek || pts < stats.worstWeek.points) {
      stats.worstWeek = { season: m.season, week: m.week, points: pts };
    }
  }

  // Titles, playoff appearances, last-place finishes from brackets +
  // playoff_teams setting.
  const brackets = db.prepare(`SELECT league_id, season, type, data_json FROM brackets`).all() as {
    league_id: string;
    season: string;
    type: "winners" | "losers";
    data_json: string;
  }[];
  interface BracketMatch { m: number; r: number; p?: number; w: number | null; l: number | null; t1: number | null; t2: number | null }

  for (const league of leagues) {
    // A season's bracket is provisional (placeholder seeding) until the
    // season is actually over — only "complete" seasons have a real result.
    if (league.status !== "complete") continue;

    const settings = JSON.parse(league.settings_json) as Record<string, number>;
    const playoffTeams = settings.playoff_teams ?? 0;

    const winners = brackets.find((b) => b.league_id === league.league_id && b.type === "winners");
    const losers = brackets.find((b) => b.league_id === league.league_id && b.type === "losers");

    const seededRosterIds = new Set<number>();
    if (winners) {
      const matches = JSON.parse(winners.data_json) as BracketMatch[];
      // Top seeds get a first-round bye, so they only appear as t1/t2
      // starting in round 2 — a completed season has every slot resolved,
      // so collecting across every round (not just r===1) catches them.
      for (const match of matches) {
        if (match.t1) seededRosterIds.add(match.t1);
        if (match.t2) seededRosterIds.add(match.t2);
      }
      const finalMatch = matches.find((mt) => mt.p === 1);
      if (finalMatch?.w) {
        const ownerId = ownerByLeagueRoster.get(`${league.league_id}:${finalMatch.w}`);
        if (ownerId) byUser.get(ownerId)!.titles += 1;
      }
    }
    for (const rosterId of seededRosterIds) {
      const ownerId = ownerByLeagueRoster.get(`${league.league_id}:${rosterId}`);
      if (ownerId) byUser.get(ownerId)!.playoffAppearances += 1;
    }
    if (playoffTeams === 0 && seededRosterIds.size === 0) {
      // no bracket data (in-progress season) — skip
    }

    if (losers) {
      const matches = JSON.parse(losers.data_json) as BracketMatch[];
      const finalMatch = matches.find((mt) => mt.p === 1);
      if (finalMatch?.l) {
        const ownerId = ownerByLeagueRoster.get(`${league.league_id}:${finalMatch.l}`);
        if (ownerId) byUser.get(ownerId)!.lastPlaceFinishes += 1;
      }
    }
  }

  return Array.from(byUser.values()).sort((a, b) => b.wins - a.wins);
}

// --- Head to head --------------------------------------------------------

export interface HeadToHeadRecord {
  userA: string;
  userB: string;
  aWins: number;
  bWins: number;
  ties: number;
  aPoints: number;
  bPoints: number;
  games: number;
}

export function getHeadToHeadMatrix(db: Database = getDb()): HeadToHeadRecord[] {
  const rosters = db.prepare(`SELECT league_id, roster_id, owner_id FROM rosters`).all() as {
    league_id: string;
    roster_id: number;
    owner_id: string | null;
  }[];
  const ownerByLeagueRoster = new Map<string, string | null>();
  for (const r of rosters) ownerByLeagueRoster.set(`${r.league_id}:${r.roster_id}`, r.owner_id);

  const matchups = db
    .prepare(`SELECT * FROM matchups WHERE matchup_id IS NOT NULL ORDER BY season, week`)
    .all() as MatchupRow[];

  const byWeek = new Map<string, MatchupRow[]>();
  for (const m of matchups) {
    const key = `${m.league_id}:${m.week}:${m.matchup_id}`;
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(m);
  }

  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const results = new Map<string, HeadToHeadRecord>();

  for (const pair of byWeek.values()) {
    if (pair.length !== 2) continue;
    const [m1, m2] = pair;
    const owner1 = ownerByLeagueRoster.get(`${m1.league_id}:${m1.roster_id}`);
    const owner2 = ownerByLeagueRoster.get(`${m2.league_id}:${m2.roster_id}`);
    if (!owner1 || !owner2 || owner1 === owner2) continue;
    if (pointsOf(m1) === 0 && pointsOf(m2) === 0) continue; // week not played yet

    const key = pairKey(owner1, owner2);
    if (!results.has(key)) {
      const [userA, userB] = key.split("|");
      results.set(key, { userA, userB, aWins: 0, bWins: 0, ties: 0, aPoints: 0, bPoints: 0, games: 0 });
    }
    const rec = results.get(key)!;
    const p1 = pointsOf(m1);
    const p2 = pointsOf(m2);
    const p1IsA = owner1 === rec.userA;
    const aPts = p1IsA ? p1 : p2;
    const bPts = p1IsA ? p2 : p1;
    rec.aPoints += aPts;
    rec.bPoints += bPts;
    rec.games += 1;
    if (aPts > bPts) rec.aWins += 1;
    else if (bPts > aPts) rec.bWins += 1;
    else rec.ties += 1;
  }

  return Array.from(results.values());
}

export interface HeadToHeadForUser {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  games: number;
  avgMargin: number;
}

/** Same matrix, oriented from one user's perspective — for a rivalry card, not a full grid. */
export function getHeadToHeadForPair(userId: string, opponentId: string, db: Database = getDb()): HeadToHeadForUser | null {
  const rec = getHeadToHeadMatrix(db).find(
    (r) => (r.userA === userId && r.userB === opponentId) || (r.userA === opponentId && r.userB === userId),
  );
  if (!rec || rec.games === 0) return null;

  const isA = rec.userA === userId;
  const wins = isA ? rec.aWins : rec.bWins;
  const losses = isA ? rec.bWins : rec.aWins;
  const pointsFor = isA ? rec.aPoints : rec.bPoints;
  const pointsAgainst = isA ? rec.bPoints : rec.aPoints;

  return {
    wins,
    losses,
    ties: rec.ties,
    pointsFor,
    pointsAgainst,
    games: rec.games,
    avgMargin: (pointsFor - pointsAgainst) / rec.games,
  };
}

// --- All-play / luck -------------------------------------------------

export interface WeeklyAllPlay {
  season: string;
  week: number;
  userId: string;
  points: number;
  actualWin: number; // 1 win, 0.5 tie, 0 loss against real opponent
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
}

export function getAllPlayByWeek(db: Database = getDb()): WeeklyAllPlay[] {
  const rosters = db.prepare(`SELECT league_id, roster_id, owner_id FROM rosters`).all() as {
    league_id: string;
    roster_id: number;
    owner_id: string | null;
  }[];
  const ownerByLeagueRoster = new Map<string, string | null>();
  for (const r of rosters) ownerByLeagueRoster.set(`${r.league_id}:${r.roster_id}`, r.owner_id);

  const matchups = db
    .prepare(`SELECT * FROM matchups WHERE matchup_id IS NOT NULL`)
    .all() as MatchupRow[];

  const byLeagueWeek = new Map<string, MatchupRow[]>();
  for (const m of matchups) {
    const key = `${m.league_id}:${m.week}`;
    if (!byLeagueWeek.has(key)) byLeagueWeek.set(key, []);
    byLeagueWeek.get(key)!.push(m);
  }

  const out: WeeklyAllPlay[] = [];
  for (const [key, weekMatchups] of byLeagueWeek) {
    const [leagueId, weekStr] = key.split(":");
    const week = Number(weekStr);
    const season = weekMatchups[0]?.season;

    const teams = weekMatchups
      .map((m) => ({
        ownerId: ownerByLeagueRoster.get(`${leagueId}:${m.roster_id}`),
        points: pointsOf(m),
        matchupId: m.matchup_id,
      }))
      .filter((t) => t.ownerId);

    for (const team of teams) {
      let allPlayWins = 0;
      let allPlayLosses = 0;
      let allPlayTies = 0;
      for (const other of teams) {
        if (other === team) continue;
        if (team.points > other.points) allPlayWins += 1;
        else if (team.points < other.points) allPlayLosses += 1;
        else allPlayTies += 1;
      }
      const opponent = teams.find((t) => t.matchupId === team.matchupId && t !== team);
      let actualWin = 0.5;
      if (opponent) {
        if (team.points > opponent.points) actualWin = 1;
        else if (team.points < opponent.points) actualWin = 0;
      }
      out.push({
        season,
        week,
        userId: team.ownerId!,
        points: team.points,
        actualWin,
        allPlayWins,
        allPlayLosses,
        allPlayTies,
      });
    }
  }
  return out;
}

export interface LuckSummary {
  userId: string;
  actualWinPct: number;
  allPlayWinPct: number;
  luck: number; // actual - all-play; positive = lucky
  gamesPlayed: number;
}

export function getLuckSummary(db: Database = getDb(), season?: string): LuckSummary[] {
  const rows = getAllPlayByWeek(db).filter((r) => !season || r.season === season);
  const byUser = new Map<string, { actual: number; allPlayWins: number; allPlayTotal: number; games: number }>();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, { actual: 0, allPlayWins: 0, allPlayTotal: 0, games: 0 });
    const acc = byUser.get(r.userId)!;
    acc.actual += r.actualWin;
    acc.allPlayWins += r.allPlayWins + r.allPlayTies * 0.5;
    acc.allPlayTotal += r.allPlayWins + r.allPlayLosses + r.allPlayTies;
    acc.games += 1;
  }
  return Array.from(byUser.entries()).map(([userId, acc]) => {
    const actualWinPct = acc.games > 0 ? acc.actual / acc.games : 0;
    const allPlayWinPct = acc.allPlayTotal > 0 ? acc.allPlayWins / acc.allPlayTotal : 0;
    return {
      userId,
      actualWinPct,
      allPlayWinPct,
      luck: actualWinPct - allPlayWinPct,
      gamesPlayed: acc.games,
    };
  });
}

// --- Weekly scoring distribution (feeds the odds model) -----------------

export interface ScoringDistribution {
  userId: string;
  season: string;
  mean: number;
  stdev: number;
  n: number;
}

export function getScoringDistributions(db: Database = getDb(), season?: string): ScoringDistribution[] {
  const rosters = db.prepare(`SELECT league_id, roster_id, owner_id FROM rosters`).all() as {
    league_id: string;
    roster_id: number;
    owner_id: string | null;
  }[];
  const ownerByLeagueRoster = new Map<string, string | null>();
  for (const r of rosters) ownerByLeagueRoster.set(`${r.league_id}:${r.roster_id}`, r.owner_id);

  let query = `SELECT * FROM matchups WHERE matchup_id IS NOT NULL`;
  const params: string[] = [];
  if (season) {
    query += ` AND season = ?`;
    params.push(season);
  }
  const matchups = db.prepare(query).all(...params) as MatchupRow[];

  const byUserSeason = new Map<string, number[]>();
  for (const m of matchups) {
    const ownerId = ownerByLeagueRoster.get(`${m.league_id}:${m.roster_id}`);
    if (!ownerId) continue;
    const key = `${ownerId}:${m.season}`;
    if (!byUserSeason.has(key)) byUserSeason.set(key, []);
    byUserSeason.get(key)!.push(pointsOf(m));
  }

  const out: ScoringDistribution[] = [];
  for (const [key, points] of byUserSeason) {
    const [userId, seasonKey] = key.split(":");
    const n = points.length;
    const mean = points.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? points.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    out.push({ userId, season: seasonKey, mean, stdev: Math.sqrt(variance), n });
  }
  return out;
}

/** Bayesian-shrunk mean/stdev toward the league average, weight ~ n/(n+4) per spec. */
export function shrinkToLeagueMean(dist: ScoringDistribution, leagueMean: number, leagueStdev: number) {
  const weight = dist.n / (dist.n + 4);
  return {
    mean: weight * dist.mean + (1 - weight) * leagueMean,
    stdev: weight * dist.stdev + (1 - weight) * leagueStdev,
  };
}

// --- Optimal lineup / bench points left ----------------------------------

const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
  DL: ["DL"],
  LB: ["LB"],
  DB: ["DB"],
};
const NON_STARTING_SLOTS = new Set(["BN", "IR", "TAXI"]);

export interface OptimalLineupResult {
  actualPoints: number;
  optimalPoints: number;
  pointsLeftOnBench: number;
}

/** Best-possible lineup for one team-week, respecting roster_positions slot eligibility. */
export function computeOptimalLineup(
  rosterPositions: string[],
  playersPoints: Record<string, number>,
  playerPositions: Map<string, string>,
  actualStarters: string[],
): OptimalLineupResult {
  const startingSlots = rosterPositions.filter((s) => !NON_STARTING_SLOTS.has(s));
  // Process narrowest eligibility sets first so greedy assignment is exact
  // for this laminar (nested) slot structure.
  const ordered = [...startingSlots].sort(
    (a, b) => (SLOT_ELIGIBILITY[a]?.length ?? 99) - (SLOT_ELIGIBILITY[b]?.length ?? 99),
  );

  const available = Object.keys(playersPoints).map((playerId) => ({
    playerId,
    points: playersPoints[playerId] ?? 0,
    position: playerPositions.get(playerId) ?? "UNK",
  }));
  const used = new Set<string>();
  let optimalPoints = 0;

  for (const slot of ordered) {
    const eligiblePositions = SLOT_ELIGIBILITY[slot];
    if (!eligiblePositions) continue;
    let best: (typeof available)[number] | null = null;
    for (const p of available) {
      if (used.has(p.playerId)) continue;
      if (!eligiblePositions.includes(p.position)) continue;
      if (!best || p.points > best.points) best = p;
    }
    if (best) {
      used.add(best.playerId);
      optimalPoints += best.points;
    }
  }

  const actualPoints = actualStarters.reduce((sum, playerId) => sum + (playersPoints[playerId] ?? 0), 0);

  return {
    actualPoints,
    optimalPoints,
    pointsLeftOnBench: Math.max(0, optimalPoints - actualPoints),
  };
}

export function getBenchPointsForWeek(
  leagueId: string,
  week: number,
  db: Database = getDb(),
): { rosterId: number; ownerId: string | null; result: OptimalLineupResult }[] {
  const league = db.prepare(`SELECT roster_positions_json FROM leagues WHERE league_id = ?`).get(leagueId) as
    | { roster_positions_json: string }
    | undefined;
  if (!league) return [];
  const rosterPositions = JSON.parse(league.roster_positions_json) as string[];

  const matchups = db
    .prepare(`SELECT * FROM matchups WHERE league_id = ? AND week = ?`)
    .all(leagueId, week) as MatchupRow[];
  const rosters = db.prepare(`SELECT roster_id, owner_id FROM rosters WHERE league_id = ?`).all(leagueId) as {
    roster_id: number;
    owner_id: string | null;
  }[];
  const ownerByRoster = new Map(rosters.map((r) => [r.roster_id, r.owner_id]));

  // Only fetch positions for players actually involved this week.
  const allPlayerIds = new Set<string>();
  for (const m of matchups) {
    for (const pid of Object.keys(JSON.parse(m.players_points_json) as Record<string, number>)) {
      allPlayerIds.add(pid);
    }
  }
  const playerPositions = new Map<string, string>();
  if (allPlayerIds.size > 0) {
    const placeholders = Array.from(allPlayerIds).map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT player_id, position FROM players WHERE player_id IN (${placeholders})`)
      .all(...Array.from(allPlayerIds)) as { player_id: string; position: string | null }[];
    for (const r of rows) playerPositions.set(r.player_id, r.position ?? "UNK");
  }

  return matchups.map((m) => {
    const playersPoints = JSON.parse(m.players_points_json) as Record<string, number>;
    const starters = JSON.parse(m.starters_json) as string[];
    const result = computeOptimalLineup(rosterPositions, playersPoints, playerPositions, starters);
    return { rosterId: m.roster_id, ownerId: ownerByRoster.get(m.roster_id) ?? null, result };
  });
}

// --- Draft pick value ------------------------------------------------

export interface DraftPickValue {
  draftId: string;
  season: string;
  round: number;
  pickNo: number;
  playerId: string;
  playerName: string | null;
  seasonPoints: number;
  pickedBy: string | null;
}

export function getDraftPickValues(db: Database = getDb(), season?: string): DraftPickValue[] {
  let draftQuery = `SELECT draft_id, season FROM drafts`;
  const params: string[] = [];
  if (season) {
    draftQuery += ` WHERE season = ?`;
    params.push(season);
  }
  const drafts = db.prepare(draftQuery).all(...params) as { draft_id: string; season: string }[];

  const out: DraftPickValue[] = [];
  for (const draft of drafts) {
    const picks = db
      .prepare(`SELECT pick_no, round, player_id, picked_by FROM draft_picks WHERE draft_id = ?`)
      .all(draft.draft_id) as { pick_no: number; round: number; player_id: string; picked_by: string | null }[];

    const matchups = db.prepare(`SELECT players_points_json FROM matchups WHERE season = ?`).all(draft.season) as {
      players_points_json: string;
    }[];
    const seasonPointsByPlayer = new Map<string, number>();
    for (const m of matchups) {
      const pp = JSON.parse(m.players_points_json) as Record<string, number>;
      for (const [playerId, pts] of Object.entries(pp)) {
        seasonPointsByPlayer.set(playerId, (seasonPointsByPlayer.get(playerId) ?? 0) + pts);
      }
    }

    for (const pick of picks) {
      const playerRow = db.prepare(`SELECT full_name FROM players WHERE player_id = ?`).get(pick.player_id) as
        | { full_name: string | null }
        | undefined;
      out.push({
        draftId: draft.draft_id,
        season: draft.season,
        round: pick.round,
        pickNo: pick.pick_no,
        playerId: pick.player_id,
        playerName: playerRow?.full_name ?? null,
        seasonPoints: seasonPointsByPlayer.get(pick.player_id) ?? 0,
        pickedBy: pick.picked_by,
      });
    }
  }
  return out;
}

// --- Season standings (current-season table with streaks) ---------------

export interface SeasonStandingRow {
  rosterId: number;
  ownerId: string | null;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  streak: string;
}

export function getSeasonStandings(leagueId: string, db: Database = getDb()): SeasonStandingRow[] {
  const rosters = db
    .prepare(
      `SELECT roster_id, owner_id, wins, losses, ties, fpts, fpts_decimal, fpts_against, fpts_against_decimal FROM rosters WHERE league_id = ?`,
    )
    .all(leagueId) as (RosterRow & { fpts_decimal: number; fpts_against_decimal: number })[];

  const matchups = db
    .prepare(`SELECT * FROM matchups WHERE league_id = ? AND matchup_id IS NOT NULL ORDER BY week ASC`)
    .all(leagueId) as MatchupRow[];

  const byWeek = new Map<number, MatchupRow[]>();
  for (const m of matchups) {
    if (!byWeek.has(m.week)) byWeek.set(m.week, []);
    byWeek.get(m.week)!.push(m);
  }

  const streakByRoster = new Map<number, string>();
  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
  const resultsByRoster = new Map<number, ("W" | "L" | "T")[]>();
  for (const week of weeks) {
    const pairs = new Map<number, MatchupRow[]>();
    for (const m of byWeek.get(week)!) {
      const key = m.matchup_id!;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key)!.push(m);
    }
    for (const pair of pairs.values()) {
      if (pair.length !== 2) continue;
      const [m1, m2] = pair;
      const p1 = pointsOf(m1);
      const p2 = pointsOf(m2);
      if (p1 === 0 && p2 === 0) continue; // week not played yet
      const r1: "W" | "L" | "T" = p1 > p2 ? "W" : p1 < p2 ? "L" : "T";
      const r2: "W" | "L" | "T" = r1 === "W" ? "L" : r1 === "L" ? "W" : "T";
      if (!resultsByRoster.has(m1.roster_id)) resultsByRoster.set(m1.roster_id, []);
      if (!resultsByRoster.has(m2.roster_id)) resultsByRoster.set(m2.roster_id, []);
      resultsByRoster.get(m1.roster_id)!.push(r1);
      resultsByRoster.get(m2.roster_id)!.push(r2);
    }
  }
  for (const [rosterId, results] of resultsByRoster) {
    if (results.length === 0) continue;
    const last = results[results.length - 1];
    let count = 0;
    for (let i = results.length - 1; i >= 0 && results[i] === last; i--) count++;
    streakByRoster.set(rosterId, `${last}${count}`);
  }

  return rosters
    .map((r) => ({
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pf: r.fpts + r.fpts_decimal / 100,
      pa: r.fpts_against + r.fpts_against_decimal / 100,
      streak: streakByRoster.get(r.roster_id) ?? "—",
    }))
    .sort((a, b) => b.wins - a.wins || b.pf - a.pf);
}
