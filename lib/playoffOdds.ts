import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentLeague, getNflState, type LeagueSummary } from "./league";
import { sampleNormal, getTeamDistributions, type TeamDistribution } from "./scoreModel";

interface TeamSimInput extends TeamDistribution {
  wins: number;
  losses: number;
  ties: number;
  pf: number;
}

function getTeamInputs(db: Database, league: LeagueSummary): TeamSimInput[] {
  const dists = getTeamDistributions(db, league);
  const rosters = db
    .prepare(`SELECT roster_id, wins, losses, ties, fpts, fpts_decimal FROM rosters WHERE league_id = ?`)
    .all(league.league_id) as { roster_id: number; wins: number; losses: number; ties: number; fpts: number; fpts_decimal: number }[];
  const rosterById = new Map(rosters.map((r) => [r.roster_id, r]));

  return dists.map((d) => {
    const r = rosterById.get(d.rosterId);
    return {
      ...d,
      wins: r?.wins ?? 0,
      losses: r?.losses ?? 0,
      ties: r?.ties ?? 0,
      pf: (r?.fpts ?? 0) + (r?.fpts_decimal ?? 0) / 100,
    };
  });
}

/**
 * Weeks in [1, maxWeek] still to be simulated. Anything from Sleeper's own
 * current week onward counts as remaining, even if a couple of Thursday
 * night games have already kicked off — a week in progress is not a played
 * week, and partial scores from it would corrupt the simulation same as
 * they'd corrupt the score distributions (see lib/stats.ts).
 */
function getRemainingWeeks(db: Database, leagueId: string, maxWeek: number): number[] {
  const state = getNflState(db);
  const currentWeek = state?.week ?? 1;
  const weeks: number[] = [];
  for (let week = Math.min(currentWeek, maxWeek); week <= maxWeek; week++) {
    const hasSchedule = (
      db.prepare(`SELECT 1 FROM matchups WHERE league_id = ? AND week = ? AND matchup_id IS NOT NULL LIMIT 1`).get(leagueId, week)
    );
    if (hasSchedule) weeks.push(week);
  }
  return weeks;
}

function getWeekPairs(db: Database, leagueId: string, week: number): [number, number][] {
  const rows = db
    .prepare(`SELECT roster_id, matchup_id FROM matchups WHERE league_id = ? AND week = ? AND matchup_id IS NOT NULL`)
    .all(leagueId, week) as { roster_id: number; matchup_id: number }[];
  const byMatchup = new Map<number, number[]>();
  for (const r of rows) {
    if (!byMatchup.has(r.matchup_id)) byMatchup.set(r.matchup_id, []);
    byMatchup.get(r.matchup_id)!.push(r.roster_id);
  }
  return Array.from(byMatchup.values()).filter((arr): arr is [number, number] => arr.length === 2);
}

interface SeededTeam {
  rosterId: number;
  seed: number;
}

function simMatch(a: SeededTeam, b: SeededTeam, byRoster: Map<number, TeamSimInput>): SeededTeam {
  const ta = byRoster.get(a.rosterId)!;
  const tb = byRoster.get(b.rosterId)!;
  const sa = sampleNormal(ta.mean, ta.stdev);
  const sb = sampleNormal(tb.mean, tb.stdev);
  return sa >= sb ? a : b;
}

export interface PlayoffOddsResult {
  rosterId: number;
  userId: string | null;
  displayName: string;
  makePlayoffsPct: number;
  seedPct: number[]; // index 0 = seed 1
  titlePct: number;
  lastPlacePct: number;
  mostPfPct: number;
}

export interface PlayoffOddsRun {
  season: string;
  simulations: number;
  remainingWeeks: number[];
  playoffTeams: number;
  results: PlayoffOddsResult[];
}

/**
 * Monte Carlo over the real remaining schedule (Sleeper publishes it ahead
 * of time), using each team's own shrunk score distribution. Standard
 * fantasy 6-seed bracket: top 2 get byes, seed 1 always plays the worse
 * surviving seed in the semis. Last place = worst final regular-season
 * record — a simplification; it doesn't simulate the actual toilet-bowl
 * bracket. mostPfPct doubles as the "most points for" futures market on the
 * betting odds page, so it's computed here rather than duplicating the loop.
 */
export function simulatePlayoffOdds(db: Database = getDb(), sims = 10000): PlayoffOddsRun | null {
  const league = getCurrentLeague(db);
  if (!league) return null;

  const playoffTeams = league.settings.playoff_teams ?? 6;
  const playoffWeekStart = league.settings.playoff_week_start ?? 15;
  const teams = getTeamInputs(db, league);
  const byRoster = new Map(teams.map((t) => [t.rosterId, t]));

  const remainingWeeks = getRemainingWeeks(db, league.league_id, playoffWeekStart - 1);
  const weekPairs = remainingWeeks.map((week) => getWeekPairs(db, league.league_id, week));

  const counts = new Map<
    number,
    { playoffs: number; seeds: number[]; title: number; last: number; mostPf: number }
  >();
  for (const t of teams) counts.set(t.rosterId, { playoffs: 0, seeds: new Array(playoffTeams).fill(0), title: 0, last: 0, mostPf: 0 });

  for (let sim = 0; sim < sims; sim++) {
    const state = new Map(teams.map((t) => [t.rosterId, { wins: t.wins, losses: t.losses, ties: t.ties, pf: t.pf }]));

    for (const pairs of weekPairs) {
      for (const [a, b] of pairs) {
        const ta = byRoster.get(a);
        const tb = byRoster.get(b);
        if (!ta || !tb) continue;
        const sa = sampleNormal(ta.mean, ta.stdev);
        const sb = sampleNormal(tb.mean, tb.stdev);
        const sta = state.get(a)!;
        const stb = state.get(b)!;
        sta.pf += sa;
        stb.pf += sb;
        if (sa > sb) {
          sta.wins++;
          stb.losses++;
        } else if (sb > sa) {
          stb.wins++;
          sta.losses++;
        } else {
          sta.ties++;
          stb.ties++;
        }
      }
    }

    const standings = teams
      .map((t) => ({ rosterId: t.rosterId, ...state.get(t.rosterId)! }))
      .sort((x, y) => y.wins - x.wins || y.pf - x.pf);

    counts.get(standings[standings.length - 1].rosterId)!.last++;

    let mostPfRoster = standings[0].rosterId;
    let mostPf = standings[0].pf;
    for (const s of standings) {
      if (s.pf > mostPf) {
        mostPf = s.pf;
        mostPfRoster = s.rosterId;
      }
    }
    counts.get(mostPfRoster)!.mostPf++;

    const playoffField = standings.slice(0, playoffTeams);
    playoffField.forEach((s, i) => {
      const c = counts.get(s.rosterId)!;
      c.playoffs++;
      c.seeds[i]++;
    });

    if (playoffTeams === 6 && playoffField.length === 6) {
      const seeded: SeededTeam[] = playoffField.map((s, i) => ({ rosterId: s.rosterId, seed: i + 1 }));
      const [seed1, seed2, seed3, seed4, seed5, seed6] = seeded;
      const winA = simMatch(seed3, seed6, byRoster);
      const winB = simMatch(seed4, seed5, byRoster);
      const [betterSemifinalist, worseSemifinalist] = [winA, winB].sort((x, y) => x.seed - y.seed);
      const final1 = simMatch(seed1, worseSemifinalist, byRoster);
      const final2 = simMatch(seed2, betterSemifinalist, byRoster);
      const champion = simMatch(final1, final2, byRoster);
      counts.get(champion.rosterId)!.title++;
    }
  }

  const results: PlayoffOddsResult[] = teams.map((t) => {
    const c = counts.get(t.rosterId)!;
    return {
      rosterId: t.rosterId,
      userId: t.userId,
      displayName: t.displayName,
      makePlayoffsPct: (c.playoffs / sims) * 100,
      seedPct: c.seeds.map((s) => (s / sims) * 100),
      titlePct: (c.title / sims) * 100,
      lastPlacePct: (c.last / sims) * 100,
      mostPfPct: (c.mostPf / sims) * 100,
    };
  });

  results.sort((a, b) => b.makePlayoffsPct - a.makePlayoffsPct || b.titlePct - a.titlePct);

  return { season: league.season, simulations: sims, remainingWeeks, playoffTeams, results };
}

export interface PlayoffOddsHistoryPoint {
  week: number;
  rosterId: number;
  userId: string | null;
  displayName: string;
  makePlayoffsPct: number;
  titlePct: number;
  lastPlacePct: number;
}

/**
 * The accumulated snapshot history for the current season — one point per
 * (week, roster) pair, oldest first. Only as long as the season is: this
 * table only ever gets a new row when someone runs the ingest script, so
 * early in a season it may be a single point.
 */
export function getPlayoffOddsHistory(db: Database = getDb()): PlayoffOddsHistoryPoint[] {
  const league = getCurrentLeague(db);
  if (!league) return [];

  const rows = db
    .prepare(
      `SELECT s.week as week, s.roster_id as roster_id, r.owner_id as owner_id,
              COALESCE(lu.display_name, r.owner_id, 'Roster ' || s.roster_id) as display_name,
              s.make_playoffs_pct as make_playoffs_pct, s.title_pct as title_pct, s.last_place_pct as last_place_pct
       FROM playoff_odds_snapshots s
       JOIN rosters r ON r.league_id = s.league_id AND r.roster_id = s.roster_id
       LEFT JOIN league_users lu ON lu.league_id = s.league_id AND lu.user_id = r.owner_id
       WHERE s.league_id = ?
       ORDER BY s.week ASC`,
    )
    .all(league.league_id) as {
    week: number;
    roster_id: number;
    owner_id: string | null;
    display_name: string;
    make_playoffs_pct: number;
    title_pct: number;
    last_place_pct: number;
  }[];

  return rows.map((r) => ({
    week: r.week,
    rosterId: r.roster_id,
    userId: r.owner_id,
    displayName: r.display_name,
    makePlayoffsPct: r.make_playoffs_pct,
    titlePct: r.title_pct,
    lastPlacePct: r.last_place_pct,
  }));
}
