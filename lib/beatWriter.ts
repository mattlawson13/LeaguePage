import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getHeadToHeadForPair } from "./stats";
import { computeOptimalLineup } from "./stats";
import { fmtPoints } from "./format";
import type { WeekMatchup, MatchupTeam, MatchupPlayer } from "./matchups";

/**
 * Procedurally generated "beat writer" copy for a single matchup. Built from
 * the same deterministic hash-template approach as lib/superlatives.ts
 * (seeded by matchup/season/week so re-rendering the same week is stable)
 * rather than a live LLM call, since the site otherwise has no LLM API
 * integration or key. Free, no new dependency, no ongoing per-request cost.
 */

function hashPick<T>(seed: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return options[Math.abs(h) % options.length];
}

function template(seed: string, options: string[], vars: Record<string, string>): string {
  const chosen = hashPick(seed, options);
  return chosen.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export interface MatchupArticle {
  headline: string;
  paragraphs: string[];
}

function topPerformer(team: MatchupTeam): MatchupPlayer | null {
  return [...team.starters].sort((a, b) => b.points - a.points)[0] ?? null;
}

function biggestBust(team: MatchupTeam): MatchupPlayer | null {
  const started = team.starters.filter((p) => p.playerId !== "0");
  if (started.length === 0) return null;
  return [...started].sort((a, b) => a.points - b.points)[0];
}

interface RosterPositionsRow {
  roster_positions_json: string;
}

function optimalLineupFor(team: MatchupTeam, rosterPositions: string[]) {
  const playersPoints: Record<string, number> = {};
  const playerPositions = new Map<string, string>();
  for (const p of [...team.starters, ...team.bench]) {
    playersPoints[p.playerId] = p.points;
    playerPositions.set(p.playerId, p.position);
  }
  const actualStarters = team.starters.map((p) => p.playerId);
  return computeOptimalLineup(rosterPositions, playersPoints, playerPositions, actualStarters);
}

export function getMatchupArticle(
  matchup: WeekMatchup,
  leagueId: string,
  season: string,
  week: number,
  db: Database = getDb(),
): MatchupArticle | null {
  const [teamA, teamB] = matchup.teams;
  if (!teamA || !teamB) return null;

  const seed = `${leagueId}-${season}-${week}-${matchup.matchupId}`;
  const margin = Math.abs(teamA.points - teamB.points);
  const winner = teamA.points >= teamB.points ? teamA : teamB;
  const loser = teamA.points >= teamB.points ? teamB : teamA;
  const paragraphs: string[] = [];

  // Headline
  const blowout = margin >= 30;
  const nailbiter = margin <= 5;
  const headline = blowout
    ? template(`hl-blow-${seed}`, [
        "{winner} runs away from {loser}",
        "{winner} makes quick work of {loser}",
      ], { winner: winner.managerName, loser: loser.managerName })
    : nailbiter
      ? template(`hl-close-${seed}`, [
          "{winner} survives {loser} in a nail-biter",
          "{winner} edges {loser} down to the wire",
        ], { winner: winner.managerName, loser: loser.managerName })
      : template(`hl-std-${seed}`, [
          "{winner} takes down {loser}",
          "{winner} gets the better of {loser}",
        ], { winner: winner.managerName, loser: loser.managerName });

  // Lede: the recap
  paragraphs.push(
    template(`lede-${seed}`, [
      "{winner} put up {winnerPts} to {loser}'s {loserPts}, a {margin}-point final that {tone}.",
      "It finished {winner} {winnerPts}, {loser} {loserPts}. {toneCap}",
    ], {
      winner: winner.managerName,
      loser: loser.managerName,
      winnerPts: fmtPoints(winner.points),
      loserPts: fmtPoints(loser.points),
      margin: fmtPoints(margin),
      tone: blowout ? "was over by the second quarter" : nailbiter ? "came down to the last stat sheet correction" : "never quite got out of hand",
      toneCap: blowout ? "It was over early." : nailbiter ? "It came down to the wire." : "A solid, unspectacular win.",
    }),
  );

  // Head-to-head history
  if (teamA.userId && teamB.userId) {
    const h2h = getHeadToHeadForPair(teamA.userId, teamB.userId, db);
    if (h2h && h2h.games > 1) {
      const leaderIsWinner = h2h.wins >= h2h.losses;
      paragraphs.push(
        template(`h2h-${seed}`, [
          "These two have history: {games} meetings, {record}. {note}",
          "Not their first dance. {record} across {games} matchups between them. {note}",
        ], {
          games: String(h2h.games),
          record: h2h.wins === h2h.losses ? `dead even at ${h2h.wins}-${h2h.losses}` : `${h2h.wins}-${h2h.losses}`,
          note:
            h2h.wins === h2h.losses
              ? "Nobody has the edge yet."
              : leaderIsWinner
                ? "The trend held again this week."
                : "The trend broke this week.",
        }),
      );
    } else {
      paragraphs.push(
        template(`h2h-first-${seed}`, [
          "First time these two have squared off. No history to lean on yet.",
          "A fresh matchup: these two haven't played enough to have a real rivalry file.",
        ], {}),
      );
    }
  }

  // Lineup IQ
  const league = db.prepare(`SELECT roster_positions_json FROM leagues WHERE league_id = ?`).get(leagueId) as
    | RosterPositionsRow
    | undefined;
  if (league) {
    const rosterPositions = JSON.parse(league.roster_positions_json) as string[];
    const optA = optimalLineupFor(teamA, rosterPositions);
    const optB = optimalLineupFor(teamB, rosterPositions);
    const worse = optA.pointsLeftOnBench >= optB.pointsLeftOnBench ? { team: teamA, opt: optA } : { team: teamB, opt: optB };
    if (worse.opt.pointsLeftOnBench > 1) {
      paragraphs.push(
        template(`lineup-${seed}`, [
          "{name}'s bench tells a story: {pts} points sat there unused this week. The optimal lineup was right there.",
          "Lineup IQ check: {name} left {pts} points on the bench that could've been in the starting lineup.",
        ], { name: worse.team.managerName, pts: fmtPoints(worse.opt.pointsLeftOnBench) }),
      );
    } else {
      paragraphs.push(
        template(`lineup-clean-${seed}`, [
          "Both sides played it close to optimal this week. Not much lineup regret on either bench.",
          "Clean week for both lineups: neither manager left much on the table.",
        ], {}),
      );
    }
  }

  // Player spotlight
  const bestA = topPerformer(teamA);
  const bestB = topPerformer(teamB);
  const stars = [bestA, bestB].filter((p): p is MatchupPlayer => Boolean(p) && p!.points > 0);
  const star = stars.sort((a, b) => b.points - a.points)[0];
  const bustCandidates = [biggestBust(teamA), biggestBust(teamB)].filter(
    (p): p is MatchupPlayer => Boolean(p) && p!.position !== "DEF" && p!.points < 5,
  );
  const bust = bustCandidates[0];
  if (star) {
    const starTeam = teamA.starters.includes(star) ? teamA : teamB;
    paragraphs.push(
      template(`star-${seed}`, [
        "{name} carried {team} this week, dropping {pts} points at {pos}.",
        "The headliner: {name} went off for {pts} for {team}.",
      ], { name: star.name, team: starTeam.managerName, pts: fmtPoints(star.points), pos: star.position }),
    );
  }
  if (bust && (!star || bust.playerId !== star.playerId)) {
    const bustTeam = teamA.starters.includes(bust) ? teamA : teamB;
    paragraphs.push(
      template(`bust-${seed}`, [
        "Not so much from {name}, who started for {team} and managed just {pts} points.",
        "{team} got nothing from {name} this week, {pts} points from the starting {pos} spot.",
      ], { name: bust.name, team: bustTeam.managerName, pts: fmtPoints(bust.points), pos: bust.position }),
    );
  }

  return { headline, paragraphs };
}
