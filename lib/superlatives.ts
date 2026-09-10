import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getNflState } from "./league";
import { getBenchPointsForWeek, getLuckSummary, getDraftPickValues } from "./stats";
import { fmtPoints } from "./format";

function hashPick<T>(seed: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return options[Math.abs(h) % options.length];
}

function template(seed: string, options: string[], vars: Record<string, string>): string {
  const chosen = hashPick(seed, options);
  return chosen.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

interface RosterInfo {
  rosterId: number;
  userId: string | null;
  displayName: string;
}

function getRosterInfo(db: Database, leagueId: string): Map<number, RosterInfo> {
  const rows = db
    .prepare(
      `SELECT r.roster_id as roster_id, r.owner_id as owner_id,
              COALESCE(lu.display_name, r.owner_id, 'Roster ' || r.roster_id) as display_name
       FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as { roster_id: number; owner_id: string | null; display_name: string }[];
  return new Map(rows.map((r) => [r.roster_id, { rosterId: r.roster_id, userId: r.owner_id, displayName: r.display_name }]));
}

export interface LatestWeek {
  leagueId: string;
  season: string;
  week: number;
}

/** The most recently completed week across all ingested history — skips the live season's in-progress week. */
export function getLatestCompletedWeek(db: Database = getDb()): LatestWeek | null {
  const state = getNflState(db);
  const rows = db
    .prepare(
      `SELECT DISTINCT league_id, season, week FROM matchups WHERE matchup_id IS NOT NULL ORDER BY season DESC, week DESC`,
    )
    .all() as { league_id: string; season: string; week: number }[];

  for (const r of rows) {
    if (state && r.season === state.season && r.week >= state.week) continue;
    const pts = db
      .prepare(`SELECT COALESCE(custom_points, points) as pts FROM matchups WHERE league_id = ? AND week = ? AND matchup_id IS NOT NULL`)
      .all(r.league_id, r.week) as { pts: number }[];
    if (pts.some((p) => p.pts !== 0)) return { leagueId: r.league_id, season: r.season, week: r.week };
  }
  return null;
}

export interface WeeklySuperlative {
  title: string;
  copy: string;
}

export function getWeeklySuperlatives(latest: LatestWeek, db: Database = getDb()): WeeklySuperlative[] {
  const rosterInfo = getRosterInfo(db, latest.leagueId);
  const matchups = db
    .prepare(`SELECT roster_id, matchup_id, COALESCE(custom_points, points) as pts FROM matchups WHERE league_id = ? AND week = ? AND matchup_id IS NOT NULL`)
    .all(latest.leagueId, latest.week) as { roster_id: number; matchup_id: number; pts: number }[];

  const name = (rosterId: number) => rosterInfo.get(rosterId)?.displayName ?? `Roster ${rosterId}`;

  const results: WeeklySuperlative[] = [];

  // Team of the week
  const topTeam = [...matchups].sort((a, b) => b.pts - a.pts)[0];
  if (topTeam) {
    results.push({
      title: "Team of the week",
      copy: template(`totw-${latest.season}-${latest.week}`, [
        "{name} put up {pts} — the best score anyone managed this week.",
        "Nobody topped {name}'s {pts} points this week.",
      ], { name: name(topTeam.roster_id), pts: fmtPoints(topTeam.pts) }),
    });
  }

  // Pair up matchups
  const byMatchup = new Map<number, typeof matchups>();
  for (const m of matchups) {
    if (!byMatchup.has(m.matchup_id)) byMatchup.set(m.matchup_id, []);
    byMatchup.get(m.matchup_id)!.push(m);
  }
  const pairs = Array.from(byMatchup.values()).filter((p) => p.length === 2);

  let blowout: { winner: number; loser: number; margin: number } | null = null;
  let closest: { a: number; b: number; margin: number } | null = null;
  let unluckiest: { rosterId: number; pts: number } | null = null;

  for (const [a, b] of pairs) {
    const margin = Math.abs(a.pts - b.pts);
    const winner = a.pts >= b.pts ? a : b;
    const loser = a.pts >= b.pts ? b : a;
    if (!blowout || margin > blowout.margin) blowout = { winner: winner.roster_id, loser: loser.roster_id, margin };
    if (!closest || margin < closest.margin) closest = { a: a.roster_id, b: b.roster_id, margin };
    if (!unluckiest || loser.pts > unluckiest.pts) unluckiest = { rosterId: loser.roster_id, pts: loser.pts };
  }

  if (blowout) {
    results.push({
      title: "Biggest blowout",
      copy: template(`blowout-${latest.season}-${latest.week}`, [
        "{winner} demolished {loser} by {margin} points.",
        "{loser} never had a chance — {winner} won by {margin}.",
      ], { winner: name(blowout.winner), loser: name(blowout.loser), margin: fmtPoints(blowout.margin) }),
    });
  }
  if (closest) {
    results.push({
      title: "Closest call",
      copy: template(`closest-${latest.season}-${latest.week}`, [
        "{a} and {b} were separated by just {margin} points.",
        "A nail-biter: {a} vs. {b} came down to {margin} points.",
      ], { a: name(closest.a), b: name(closest.b), margin: fmtPoints(closest.margin) }),
    });
  }
  if (unluckiest) {
    results.push({
      title: "Unluckiest",
      copy: template(`unlucky-${latest.season}-${latest.week}`, [
        "{name} scored {pts} and still lost.",
        "{pts} points wasn't enough for {name} this week.",
      ], { name: name(unluckiest.rosterId), pts: fmtPoints(unluckiest.pts) }),
    });
  }

  // Biggest bench regret
  const benchData = getBenchPointsForWeek(latest.leagueId, latest.week, db);
  const worstBench = [...benchData].sort((a, b) => b.result.pointsLeftOnBench - a.result.pointsLeftOnBench)[0];
  if (worstBench && worstBench.result.pointsLeftOnBench > 0.5) {
    results.push({
      title: "Biggest bench regret",
      copy: template(`bench-${latest.season}-${latest.week}`, [
        "{name} left {pts} points on the bench — their optimal lineup would have scored that much more.",
        "{name} could've had {pts} more points with a better lineup.",
      ], { name: name(worstBench.rosterId), pts: fmtPoints(worstBench.result.pointsLeftOnBench) }),
    });
  }

  return results;
}

export interface SeasonalSuperlative {
  title: string;
  copy: string;
}

export function getSeasonalSuperlatives(season: string, leagueId: string, db: Database = getDb()): SeasonalSuperlative[] {
  const rosterInfo = getRosterInfo(db, leagueId);
  const nameByUser = new Map<string, string>();
  for (const r of rosterInfo.values()) if (r.userId) nameByUser.set(r.userId, r.displayName);

  const results: SeasonalSuperlative[] = [];

  // Luckiest / unluckiest via all-play
  const luck = getLuckSummary(db, season).filter((l) => l.gamesPlayed > 0);
  const luckiest = [...luck].sort((a, b) => b.luck - a.luck)[0];
  const unluckiest = [...luck].sort((a, b) => a.luck - b.luck)[0];
  if (luckiest && luckiest.luck > 0.02) {
    results.push({
      title: "Luckiest",
      copy: template(`luckiest-${season}`, [
        "{name}'s actual win rate is running {pct}pts ahead of their all-play record — the schedule has been kind.",
        "{name} has won more than their all-play record says they should have, by {pct} points.",
      ], { name: nameByUser.get(luckiest.userId) ?? luckiest.userId, pct: (luckiest.luck * 100).toFixed(1) }),
    });
  }
  if (unluckiest && unluckiest.luck < -0.02) {
    results.push({
      title: "Unluckiest",
      copy: template(`unluckiest-${season}`, [
        "{name}'s all-play record is {pct}pts better than their actual record — rough schedule luck.",
        "{name} deserves a better record than they have — {pct} points of bad luck so far.",
      ], { name: nameByUser.get(unluckiest.userId) ?? unluckiest.userId, pct: (Math.abs(unluckiest.luck) * 100).toFixed(1) }),
    });
  }

  // Most active trader
  const tradeCounts = db
    .prepare(
      `SELECT roster_ids_json FROM transactions WHERE season = ? AND type = 'trade' AND status = 'complete'`,
    )
    .all(season) as { roster_ids_json: string }[];
  const tradesByRoster = new Map<number, number>();
  for (const t of tradeCounts) {
    const ids = JSON.parse(t.roster_ids_json) as number[];
    for (const id of ids) tradesByRoster.set(id, (tradesByRoster.get(id) ?? 0) + 1);
  }
  const topTrader = Array.from(tradesByRoster.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topTrader && topTrader[1] > 0) {
    const [rosterId, count] = topTrader;
    results.push({
      title: "Most active trader",
      copy: template(`trader-${season}`, [
        "{name} made {count} trades this season — more than anyone else in the league.",
        "Nobody worked the phones harder than {name}: {count} trades this season.",
      ], { name: rosterInfo.get(rosterId)?.displayName ?? `Roster ${rosterId}`, count: String(count) }),
    });
  }

  // Waiver wire king: total season points of waiver adds vs FAAB spent
  const waiverTx = db
    .prepare(`SELECT adds_json, waiver_budget_json FROM transactions WHERE season = ? AND type = 'waiver' AND status = 'complete'`)
    .all(season) as { adds_json: string; waiver_budget_json: string }[];
  const matchupRows = db
    .prepare(`SELECT players_points_json FROM matchups WHERE season = ? AND matchup_id IS NOT NULL`)
    .all(season) as { players_points_json: string }[];
  const seasonPointsByPlayer = new Map<string, number>();
  for (const m of matchupRows) {
    const pp = JSON.parse(m.players_points_json) as Record<string, number>;
    for (const [pid, pts] of Object.entries(pp)) seasonPointsByPlayer.set(pid, (seasonPointsByPlayer.get(pid) ?? 0) + pts);
  }
  const faabByRoster = new Map<number, number>();
  const waiverPointsByRoster = new Map<number, number>();
  const waiverPlayersByRoster = new Map<number, Set<string>>();
  for (const t of waiverTx) {
    const adds = JSON.parse(t.adds_json) as Record<string, number> | null;
    const budget = JSON.parse(t.waiver_budget_json) as { receiver: number; amount: number }[];
    for (const b of budget) faabByRoster.set(b.receiver, (faabByRoster.get(b.receiver) ?? 0) + b.amount);
    if (adds) {
      for (const [pid, rosterId] of Object.entries(adds)) {
        if (!waiverPlayersByRoster.has(rosterId)) waiverPlayersByRoster.set(rosterId, new Set());
        waiverPlayersByRoster.get(rosterId)!.add(pid);
      }
    }
  }
  for (const [rosterId, players] of waiverPlayersByRoster) {
    let total = 0;
    for (const pid of players) total += seasonPointsByPlayer.get(pid) ?? 0;
    waiverPointsByRoster.set(rosterId, total);
  }
  const waiverKing = Array.from(waiverPointsByRoster.entries())
    .map(([rosterId, points]) => ({ rosterId, points, faab: faabByRoster.get(rosterId) ?? 0 }))
    .filter((w) => w.points > 0)
    .sort((a, b) => b.points - a.points)[0];
  if (waiverKing) {
    results.push({
      title: "Waiver wire king",
      copy: template(`waiver-${season}`, [
        "{name}'s waiver pickups have combined for {pts} points this season, for ${faab} in FAAB.",
        "${faab} in FAAB bought {name} {pts} points off the wire this season — nice work.",
      ], {
        name: rosterInfo.get(waiverKing.rosterId)?.displayName ?? `Roster ${waiverKing.rosterId}`,
        pts: fmtPoints(waiverKing.points),
        faab: String(waiverKing.faab),
      }),
    });
  }

  // Draft-day winner
  const picks = getDraftPickValues(db, season);
  const pointsByDrafter = new Map<string, number>();
  for (const p of picks) {
    if (!p.pickedBy) continue;
    pointsByDrafter.set(p.pickedBy, (pointsByDrafter.get(p.pickedBy) ?? 0) + p.seasonPoints);
  }
  const draftWinner = Array.from(pointsByDrafter.entries()).sort((a, b) => b[1] - a[1])[0];
  if (draftWinner) {
    const [userId, points] = draftWinner;
    results.push({
      title: "Draft-day winner",
      copy: template(`draft-${season}`, [
        "{name}'s draft class has combined for {pts} points this season — the best haul in the league.",
        "The draft board loved {name}: their picks have scored {pts} points this season.",
      ], { name: nameByUser.get(userId) ?? userId, pts: fmtPoints(points) }),
    });
  }

  return results;
}
