import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getLeagues, getBenchPointsForWeek } from "./stats";

interface BracketMatch {
  m: number;
  r: number;
  p?: number;
  w: number | null;
  l: number | null;
}

export interface SeasonAward {
  season: string;
  userId: string;
  displayName: string;
  value?: number;
}

function getBracket(db: Database, leagueId: string, type: "winners" | "losers"): BracketMatch[] | null {
  const row = db
    .prepare(`SELECT data_json FROM brackets WHERE league_id = ? AND type = ?`)
    .get(leagueId, type) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as BracketMatch[]) : null;
}

// Trophies credit a person, not a fantasy team name, so this looks up the
// Sleeper login display_name directly rather than reusing lib/league.ts's
// getRosterManagers (which prefers team_name — right for standings/matchups,
// wrong for "who won this").
function getRosterOwners(db: Database, leagueId: string): Map<number, { userId: string; displayName: string }> {
  const rows = db
    .prepare(
      `SELECT r.roster_id as roster_id, r.owner_id as owner_id, lu.display_name as display_name
       FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as { roster_id: number; owner_id: string | null; display_name: string | null }[];

  const map = new Map<number, { userId: string; displayName: string }>();
  for (const r of rows) {
    if (!r.owner_id) continue;
    map.set(r.roster_id, { userId: r.owner_id, displayName: r.display_name ?? r.owner_id });
  }
  return map;
}

export function getChampions(db: Database = getDb()): SeasonAward[] {
  const leagues = getLeagues(db).filter((l) => l.status === "complete");
  const out: SeasonAward[] = [];
  for (const league of leagues) {
    const bracket = getBracket(db, league.league_id, "winners");
    const finalMatch = bracket?.find((m) => m.p === 1);
    if (!finalMatch?.w) continue;
    const manager = getRosterOwners(db, league.league_id).get(finalMatch.w);
    if (!manager?.userId) continue;
    out.push({ season: league.season, userId: manager.userId, displayName: manager.displayName });
  }
  return out.sort((a, b) => b.season.localeCompare(a.season));
}

export function getToiletBowls(db: Database = getDb()): SeasonAward[] {
  const leagues = getLeagues(db).filter((l) => l.status === "complete");
  const out: SeasonAward[] = [];
  for (const league of leagues) {
    const bracket = getBracket(db, league.league_id, "losers");
    const finalMatch = bracket?.find((m) => m.p === 1);
    if (!finalMatch?.l) continue;
    const manager = getRosterOwners(db, league.league_id).get(finalMatch.l);
    if (!manager?.userId) continue;
    out.push({ season: league.season, userId: manager.userId, displayName: manager.displayName });
  }
  return out.sort((a, b) => b.season.localeCompare(a.season));
}

/** Highest single-season points-for among managers who did NOT win that season's title. */
export function getBestSeasonWithoutTitle(db: Database = getDb()): SeasonAward | null {
  const leagues = getLeagues(db).filter((l) => l.status === "complete");
  let best: SeasonAward | null = null;

  for (const league of leagues) {
    const bracket = getBracket(db, league.league_id, "winners");
    const championRosterId = bracket?.find((m) => m.p === 1)?.w ?? null;
    const rosterManagers = getRosterOwners(db, league.league_id);
    const rosters = db
      .prepare(`SELECT roster_id, owner_id, fpts, fpts_decimal FROM rosters WHERE league_id = ?`)
      .all(league.league_id) as { roster_id: number; owner_id: string | null; fpts: number; fpts_decimal: number }[];

    for (const r of rosters) {
      if (r.roster_id === championRosterId) continue;
      const manager = rosterManagers.get(r.roster_id);
      if (!manager?.userId) continue;
      const pf = r.fpts + r.fpts_decimal / 100;
      if (!best || pf > (best.value ?? 0)) {
        best = { season: league.season, userId: manager.userId, displayName: manager.displayName, value: pf };
      }
    }
  }
  return best;
}

/** Largest single-season total of points left on the bench (optimal lineup vs. actual, summed across the season). */
export function getMostBenchPointsSeason(db: Database = getDb(), maxWeek = 18): SeasonAward | null {
  const leagues = getLeagues(db).filter((l) => l.status === "complete");
  let best: SeasonAward | null = null;

  for (const league of leagues) {
    const rosterManagers = getRosterOwners(db, league.league_id);
    const totals = new Map<number, number>();

    for (let week = 1; week <= maxWeek; week++) {
      const weekData = getBenchPointsForWeek(league.league_id, week, db);
      for (const { rosterId, result } of weekData) {
        totals.set(rosterId, (totals.get(rosterId) ?? 0) + result.pointsLeftOnBench);
      }
    }

    for (const [rosterId, total] of totals) {
      const manager = rosterManagers.get(rosterId);
      if (!manager?.userId) continue;
      if (!best || total > (best.value ?? 0)) {
        best = { season: league.season, userId: manager.userId, displayName: manager.displayName, value: total };
      }
    }
  }
  return best;
}

export interface AwardDefinition {
  id: string;
  name: string;
  type: "auto" | "manual";
  description: string;
}

export interface AwardsFile {
  _schema: { definitions: AwardDefinition[] };
  manualAwards: Record<string, Record<string, { winner: string; note?: string }>>;
}
