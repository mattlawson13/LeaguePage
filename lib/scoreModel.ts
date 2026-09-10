import type { Database } from "better-sqlite3";
import { getScoringDistributions, shrinkToLeagueMean } from "./stats";
import { getNflState, type LeagueSummary } from "./league";

/** Box-Muller normal sample. */
export function sampleNormal(mean: number, stdev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function meanStdev(points: number[]): { mean: number; stdev: number } | null {
  const n = points.length;
  if (n === 0) return null;
  const mean = points.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? points.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 25 ** 2;
  return { mean, stdev: Math.sqrt(variance) };
}

/**
 * League-wide scoring baseline for the shrinkage fallback. Excludes the
 * live season's current week — it's frequently only partially played (a
 * couple of Thursday-night starters scored, everyone else still at zero),
 * and that reads as a real, very low week instead of an incomplete one. If
 * the season has no complete weeks yet (e.g. it just started), falls back
 * to the most recently completed season's baseline rather than a guess.
 */
export function getLeagueBaseline(db: Database, season: string): { mean: number; stdev: number } {
  const state = getNflState(db);
  const currentWeek = state?.season === season ? state.week : null;

  const rows = db
    .prepare(`SELECT COALESCE(custom_points, points) as pts, week FROM matchups WHERE season = ? AND matchup_id IS NOT NULL`)
    .all(season) as { pts: number; week: number }[];
  const points = rows
    .filter((r) => currentWeek === null || r.week < currentWeek)
    .map((r) => r.pts)
    .filter((p) => p !== 0);

  const stats = meanStdev(points);
  if (stats) return stats;

  const prevSeason = db
    .prepare(`SELECT season FROM leagues WHERE status = 'complete' ORDER BY season DESC LIMIT 1`)
    .get() as { season: string } | undefined;
  if (prevSeason) {
    const prevRows = db
      .prepare(`SELECT COALESCE(custom_points, points) as pts FROM matchups WHERE season = ? AND matchup_id IS NOT NULL`)
      .all(prevSeason.season) as { pts: number }[];
    const prevStats = meanStdev(prevRows.map((r) => r.pts).filter((p) => p !== 0));
    if (prevStats) return prevStats;
  }

  return { mean: 110, stdev: 25 }; // no historical data at all — first season, first week
}

export interface TeamDistribution {
  rosterId: number;
  userId: string | null;
  displayName: string;
  mean: number;
  stdev: number;
}

/** Per-team shrunk score distribution (spec's Bayesian shrinkage, weight n/(n+4) toward the league mean). */
export function getTeamDistributions(db: Database, league: LeagueSummary): TeamDistribution[] {
  const rosters = db
    .prepare(
      `SELECT r.roster_id as roster_id, r.owner_id as owner_id,
              COALESCE(lu.display_name, r.owner_id, 'Roster ' || r.roster_id) as display_name
       FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(league.league_id) as { roster_id: number; owner_id: string | null; display_name: string }[];

  const dists = getScoringDistributions(db, league.season);
  const distByUser = new Map(dists.map((d) => [d.userId, d]));
  const baseline = getLeagueBaseline(db, league.season);

  return rosters.map((r) => {
    const dist = r.owner_id ? distByUser.get(r.owner_id) : undefined;
    const shrunk = dist ? shrinkToLeagueMean(dist, baseline.mean, baseline.stdev) : baseline;
    return {
      rosterId: r.roster_id,
      userId: r.owner_id,
      displayName: r.display_name,
      mean: shrunk.mean,
      stdev: Math.max(shrunk.stdev, 5),
    };
  });
}
