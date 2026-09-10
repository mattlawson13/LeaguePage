import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentLeague, getCurrentWeek } from "./league";
import { sampleNormal, getTeamDistributions, type TeamDistribution } from "./scoreModel";
import { simulatePlayoffOdds } from "./playoffOdds";

const VIG = 0.045; // configurable overround, per spec ("~4.5%")
const SIMS = 10000;

/** American moneyline from an implied probability (already vig-loaded). */
function toMoneyline(p: number): number {
  const clamped = Math.min(Math.max(p, 0.01), 0.99);
  if (clamped >= 0.5) return Math.round((-100 * clamped) / (1 - clamped));
  return Math.round((100 * (1 - clamped)) / clamped);
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Flat heuristic — not a real replacement-value model, just enough to make a hurt starter move the number. */
function getInjuryAdjustment(db: Database, leagueId: string, week: number, rosterId: number): number {
  const row = db
    .prepare(`SELECT starters_json FROM matchups WHERE league_id = ? AND week = ? AND roster_id = ?`)
    .get(leagueId, week, rosterId) as { starters_json: string } | undefined;
  if (!row) return 0;
  const starters = (JSON.parse(row.starters_json) as string[]).filter((id) => id && id !== "0");
  if (starters.length === 0) return 0;

  const placeholders = starters.map(() => "?").join(",");
  const players = db
    .prepare(`SELECT injury_status FROM players WHERE player_id IN (${placeholders})`)
    .all(...starters) as { injury_status: string | null }[];

  let adjustment = 0;
  for (const p of players) {
    if (p.injury_status === "Out" || p.injury_status === "IR") adjustment -= 8;
    else if (p.injury_status === "Doubtful") adjustment -= 5;
    else if (p.injury_status === "Questionable") adjustment -= 1.5;
  }
  return adjustment;
}

export interface MatchupOdds {
  rosterA: { rosterId: number; userId: string | null; displayName: string };
  rosterB: { rosterId: number; userId: string | null; displayName: string };
  moneylineA: number;
  moneylineB: number;
  spread: number; // from A's perspective: negative = A favored by that many points
  total: number;
  winProbA: number;
}

function simulateOne(a: TeamDistribution, b: TeamDistribution, sims: number): { winProbA: number; spread: number; total: number } {
  let aWins = 0;
  const margins: number[] = [];
  const totals: number[] = [];
  for (let i = 0; i < sims; i++) {
    const sa = sampleNormal(a.mean, a.stdev);
    const sb = sampleNormal(b.mean, b.stdev);
    if (sa > sb) aWins++;
    margins.push(sa - sb);
    totals.push(sa + sb);
  }
  margins.sort((x, y) => x - y);
  totals.sort((x, y) => x - y);
  const mid = Math.floor(sims / 2);
  return {
    winProbA: aWins / sims,
    spread: -roundToHalf(margins[mid]), // negative = A favored
    total: roundToHalf(totals[mid]),
  };
}

/** Moneyline/spread/O-U for every matchup in the given week, current week's injury/bye adjustment applied. */
export function getWeekOdds(week?: number, db: Database = getDb()): MatchupOdds[] {
  const league = getCurrentLeague(db);
  if (!league) return [];
  const targetWeek = week ?? getCurrentWeek(db);

  const dists = getTeamDistributions(db, league);
  const byRoster = new Map(dists.map((d) => [d.rosterId, d]));

  const rows = db
    .prepare(`SELECT roster_id, matchup_id FROM matchups WHERE league_id = ? AND week = ? AND matchup_id IS NOT NULL`)
    .all(league.league_id, targetWeek) as { roster_id: number; matchup_id: number }[];
  const byMatchup = new Map<number, number[]>();
  for (const r of rows) {
    if (!byMatchup.has(r.matchup_id)) byMatchup.set(r.matchup_id, []);
    byMatchup.get(r.matchup_id)!.push(r.roster_id);
  }

  const results: MatchupOdds[] = [];
  for (const pair of byMatchup.values()) {
    if (pair.length !== 2) continue;
    const [idA, idB] = pair;
    const distA = byRoster.get(idA);
    const distB = byRoster.get(idB);
    if (!distA || !distB) continue;

    const adjA = getInjuryAdjustment(db, league.league_id, targetWeek, idA);
    const adjB = getInjuryAdjustment(db, league.league_id, targetWeek, idB);
    const a = { ...distA, mean: distA.mean + adjA };
    const b = { ...distB, mean: distB.mean + adjB };

    const { winProbA, spread, total } = simulateOne(a, b, SIMS);
    const winProbB = 1 - winProbA;
    const vigged = 1 + VIG;

    results.push({
      rosterA: { rosterId: a.rosterId, userId: a.userId, displayName: a.displayName },
      rosterB: { rosterId: b.rosterId, userId: b.userId, displayName: b.displayName },
      moneylineA: toMoneyline(winProbA * vigged),
      moneylineB: toMoneyline(winProbB * vigged),
      spread,
      total,
      winProbA,
    });
  }

  return results;
}

export interface FutureMarket {
  rosterId: number;
  userId: string | null;
  displayName: string;
  probability: number;
  moneyline: number;
}

export interface SeasonFutures {
  title: FutureMarket[];
  mostPf: FutureMarket[];
  lastPlace: FutureMarket[];
}

/** Season-long futures markets, reusing the playoff-odds simulation so the numbers are internally consistent. */
export function getSeasonFutures(db: Database = getDb()): SeasonFutures | null {
  const run = simulatePlayoffOdds(db, SIMS);
  if (!run) return null;

  // Multi-way field: scale every implied probability by the same overround
  // so the book's edge is consistent with the vig used on individual games.
  const vigged = 1 + VIG;
  const toMarket = (key: "titlePct" | "mostPfPct" | "lastPlacePct"): FutureMarket[] =>
    run.results
      .map((r) => {
        const p = (r[key] / 100) * vigged;
        return {
          rosterId: r.rosterId,
          userId: r.userId,
          displayName: r.displayName,
          probability: r[key] / 100,
          moneyline: toMoneyline(p),
        };
      })
      .sort((a, b) => b.probability - a.probability);

  return {
    title: toMarket("titlePct"),
    mostPf: toMarket("mostPfPct"),
    lastPlace: toMarket("lastPlacePct"),
  };
}
