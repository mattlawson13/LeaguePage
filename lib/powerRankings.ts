import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentLeague, getCurrentWeek, getRosterManagers } from "./league";
import { getManagerCareerStats, getSeasonStandings } from "./stats";

/**
 * Power score blends an all-time component (career win% + career avg PF,
 * z-scored across the league) with a current-season component (same two
 * measures, but for this season only). Early in a season there's almost no
 * current-season signal, so the blend leans on all-time history; as more
 * weeks get played, `recentWeight` climbs and the current record takes
 * over. By week 8 it's pure current-season. There's no "correct" power
 * ranking formula, so this is a reasonable, explainable one rather than a
 * definitive one.
 */
const RAMP_WEEKS = 8;

function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[], avg: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + (b - avg) ** 2, 0) / (xs.length - 1));
}

function zScore(x: number, avg: number, sd: number): number {
  return sd > 0 ? (x - avg) / sd : 0;
}

export interface PowerRanking {
  rosterId: number;
  userId: string | null;
  displayName: string;
  avatar: string | null;
  score: number;
  currentRecord: string;
  allTimeRecord: string;
  recentWeight: number;
  movement: number | null;
  tag: string;
}

function tagFor(rank: number, total: number, movement: number | null): string {
  if (rank === 1) return "The one to fear";
  if (movement !== null && movement >= 2) return "Trending up";
  if (movement !== null && movement <= -2) return "Free fall";
  if (rank <= Math.ceil(total * 0.3)) return "Rounding into form";
  if (rank >= Math.floor(total * 0.75)) return "In a rut";
  return "Steady as it goes";
}

export function computePowerRankings(db: Database = getDb()): PowerRanking[] {
  const league = getCurrentLeague(db);
  if (!league) return [];

  const standings = getSeasonStandings(league.league_id, db);
  const rosterManagers = getRosterManagers(league.league_id, db);
  const career = getManagerCareerStats(db);
  const careerByUser = new Map(career.map((c) => [c.userId, c]));

  const currentWeek = getCurrentWeek(db);
  const weeksPlayed = Math.max(0, currentWeek - 1);
  const recentWeight = Math.min(weeksPlayed / RAMP_WEEKS, 1);

  const currentWinPct = standings.map((s) => {
    const games = s.wins + s.losses + s.ties;
    return games > 0 ? (s.wins + s.ties * 0.5) / games : 0.5;
  });
  const currentAvgPf = standings.map((s) => {
    const games = s.wins + s.losses + s.ties;
    return games > 0 ? s.pf / games : 0;
  });
  const cwMean = mean(currentWinPct);
  const cwSd = stdev(currentWinPct, cwMean);
  const cpMean = mean(currentAvgPf);
  const cpSd = stdev(currentAvgPf, cpMean);

  const allTimeWinPct = career.map((c) => {
    const games = c.wins + c.losses + c.ties;
    return games > 0 ? (c.wins + c.ties * 0.5) / games : 0.5;
  });
  const allTimeAvgPf = career.map((c) => c.avgPf);
  const awMean = mean(allTimeWinPct);
  const awSd = stdev(allTimeWinPct, awMean);
  const apMean = mean(allTimeAvgPf);
  const apSd = stdev(allTimeAvgPf, apMean);

  const raw = standings.map((s, i) => {
    const currentZ = 0.6 * zScore(currentWinPct[i], cwMean, cwSd) + 0.4 * zScore(currentAvgPf[i], cpMean, cpSd);
    const c = s.ownerId ? careerByUser.get(s.ownerId) : undefined;
    const atWinPct = c ? (c.wins + c.ties * 0.5) / Math.max(1, c.wins + c.losses + c.ties) : 0.5;
    const atAvgPf = c?.avgPf ?? 0;
    const allTimeZ = 0.6 * zScore(atWinPct, awMean, awSd) + 0.4 * zScore(atAvgPf, apMean, apSd);
    return {
      s,
      c,
      rawScore: recentWeight * currentZ + (1 - recentWeight) * allTimeZ,
    };
  });

  const rawScores = raw.map((r) => r.rawScore);
  const minRaw = Math.min(...rawScores);
  const maxRaw = Math.max(...rawScores);
  const spread = maxRaw - minRaw;

  const prevSnapshot = getPreviousSnapshotRanks(db, league.league_id, currentWeek);

  const ranked = raw
    .map(({ s, c, rawScore }) => {
      const score = spread > 0 ? ((rawScore - minRaw) / spread) * 100 : 50;
      const manager = rosterManagers.get(s.rosterId);
      return {
        rosterId: s.rosterId,
        userId: s.ownerId,
        displayName: manager?.displayName ?? `Roster ${s.rosterId}`,
        avatar: manager?.avatar ?? null,
        score,
        currentRecord: s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`,
        allTimeRecord: c ? (c.ties > 0 ? `${c.wins}-${c.losses}-${c.ties}` : `${c.wins}-${c.losses}`) : "0-0",
        recentWeight,
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.map((r, i) => {
    const prevRank = prevSnapshot.get(r.rosterId);
    const movement = prevRank !== undefined ? prevRank - (i + 1) : null;
    return { ...r, movement, tag: tagFor(i + 1, ranked.length, movement) };
  });
}

/** Ranks rosters held by the most recent snapshot week before `beforeWeek`, so movement compares against last ingest. */
function getPreviousSnapshotRanks(db: Database, leagueId: string, beforeWeek: number): Map<number, number> {
  const row = db
    .prepare(`SELECT MAX(week) as week FROM power_ranking_snapshots WHERE league_id = ? AND week < ?`)
    .get(leagueId, beforeWeek) as { week: number | null };
  if (!row.week) return new Map();

  const rows = db
    .prepare(`SELECT roster_id, score FROM power_ranking_snapshots WHERE league_id = ? AND week = ? ORDER BY score DESC`)
    .all(leagueId, row.week) as { roster_id: number; score: number }[];

  const map = new Map<number, number>();
  rows.forEach((r, i) => map.set(r.roster_id, i + 1));
  return map;
}

export interface PowerRankingHistoryPoint {
  week: number;
  rosterId: number;
  score: number;
}

export function getPowerRankingHistory(db: Database = getDb()): PowerRankingHistoryPoint[] {
  const league = getCurrentLeague(db);
  if (!league) return [];
  const rows = db
    .prepare(`SELECT week, roster_id, score FROM power_ranking_snapshots WHERE league_id = ? ORDER BY week ASC`)
    .all(league.league_id) as { week: number; roster_id: number; score: number }[];
  return rows.map((r) => ({ week: r.week, rosterId: r.roster_id, score: r.score }));
}
