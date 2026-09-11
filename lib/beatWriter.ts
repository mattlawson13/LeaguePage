import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getHeadToHeadForPair, getSeasonStandings, getManagerCareerStats, computeOptimalLineup } from "./stats";
import { fmtPoints, fmtRecord } from "./format";
import { resolveManagers } from "./managers";
import { isNamedPair, isHouseDivided, getTopAutoRivalries } from "./rivalries";
import { getWeekOdds } from "./odds";
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

const SKIP_BENCH_FLAG_POSITIONS = new Set(["K", "DEF"]);
// Flavor text only, not real roster advice: require a real gap in career
// production before calling out a bench decision, so two comparably-good
// options don't get flagged as a "questionable call."
const BENCH_FLAG_MIN_GAP = 25;

function findQuestionableStart(
  team: MatchupTeam,
  careerPointsById: Map<string, number>,
): { starter: MatchupPlayer; benchPlayer: MatchupPlayer; benchCareer: number; starterCareer: number } | null {
  for (const benchPlayer of team.bench) {
    if (benchPlayer.playerId === "0" || SKIP_BENCH_FLAG_POSITIONS.has(benchPlayer.position)) continue;
    const benchCareer = careerPointsById.get(benchPlayer.playerId) ?? 0;
    if (benchCareer <= 0) continue;
    for (const starter of team.starters) {
      if (starter.position !== benchPlayer.position) continue;
      const starterCareer = careerPointsById.get(starter.playerId) ?? 0;
      if (benchCareer - starterCareer >= BENCH_FLAG_MIN_GAP) {
        return { starter, benchPlayer, benchCareer, starterCareer };
      }
    }
  }
  return null;
}

/**
 * Rivalry framing for a preview, checked in order of how deliberate the
 * rivalry is: a hand-tagged relationship (married/dating couples playing
 * each other) beats a hand-tagged named rivalry, which beats an
 * auto-detected one (a close, well-played series nobody's bothered to name).
 * Most matchups are none of these, and stay silent rather than force
 * "rivalry" language onto an ordinary pairing.
 */
function rivalryParagraph(
  teamA: MatchupTeam,
  teamB: MatchupTeam,
  seed: string,
  db: Database,
): string | null {
  if (!teamA.userId || !teamB.userId) return null;
  const managers = resolveManagers(db);
  const mA = managers.find((m) => m.userId === teamA.userId);
  const mB = managers.find((m) => m.userId === teamB.userId);
  if (!mA || !mB) return null;

  if (isHouseDivided(mA, mB)) {
    return template(`rivalry-house-${seed}`, [
      "This one's a house divided: {a} and {b} go home together no matter who wins tonight.",
      "Nothing like a little tension at home: {a} and {b} share more than a roof, they share this rivalry.",
    ], { a: teamA.managerName, b: teamB.managerName });
  }
  if (isNamedPair(mA, mB)) {
    return template(`rivalry-named-${seed}`, [
      "Circle this one: {a} vs. {b} is one of this league's marquee rivalries.",
      "This is personal. {a} and {b} have had each other's numbers saved for a while.",
    ], { a: teamA.managerName, b: teamB.managerName });
  }
  const topAuto = getTopAutoRivalries(3, db);
  const isQuietRivalry = topAuto.some(
    (p) =>
      (p.a.userId === teamA.userId && p.b.userId === teamB.userId) ||
      (p.a.userId === teamB.userId && p.b.userId === teamA.userId),
  );
  if (isQuietRivalry) {
    return template(`rivalry-auto-${seed}`, [
      "Nobody's officially named it, but {a} vs. {b} has quietly become one of the tightest series in this league.",
      "No nickname yet, but {a} and {b} have made a real case for one.",
    ], { a: teamA.managerName, b: teamB.managerName });
  }
  return null;
}

/**
 * A little more analysis than the framing paragraph gives: the actual
 * modeled spread/win probability this site already computes for the
 * Betting Odds page, plus a notable win/loss streak, so the preview says
 * something a plain records comparison doesn't.
 */
function analysisParagraph(
  teamA: MatchupTeam,
  teamB: MatchupTeam,
  week: number,
  seed: string,
  db: Database,
): string | null {
  const odds = getWeekOdds(week, db);
  const line = odds.find(
    (o) =>
      (o.rosterA.rosterId === teamA.rosterId && o.rosterB.rosterId === teamB.rosterId) ||
      (o.rosterA.rosterId === teamB.rosterId && o.rosterB.rosterId === teamA.rosterId),
  );
  if (!line) return null;

  const aIsRosterA = line.rosterA.rosterId === teamA.rosterId;
  const spreadForA = aIsRosterA ? line.spread : -line.spread;
  const winProbA = aIsRosterA ? line.winProbA : 1 - line.winProbA;
  const favorite = spreadForA <= 0 ? teamA : teamB;
  const dog = favorite === teamA ? teamB : teamA;
  const favoriteWinPct = Math.round((favorite === teamA ? winProbA : 1 - winProbA) * 100);
  const spreadPts = fmtPoints(Math.abs(spreadForA));

  if (Math.abs(spreadForA) < 1) {
    return template(`analysis-pickem-${seed}`, [
      "By the numbers, this one's a true pick'em: {a} and {b} project within a point of each other, {total} combined.",
      "The model can't separate these two. Call it a coin flip, with {total} points on the board between them.",
    ], { a: teamA.managerName, b: teamB.managerName, total: fmtPoints(line.total) });
  }

  return template(`analysis-line-${seed}`, [
    "By the numbers: {favorite} projects as a {spread}-point favorite over {dog}, a {pct}% implied chance to win, with {total} total points on the board.",
    "The model likes {favorite} here, favored by {spread} over {dog} ({pct}% implied), with a projected total of {total}.",
  ], {
    favorite: favorite.managerName,
    dog: dog.managerName,
    spread: spreadPts,
    pct: String(favoriteWinPct),
    total: fmtPoints(line.total),
  });
}

/**
 * Forward-looking preview for a matchup whose week hasn't finished yet
 * (per lib/league.ts's isWeekFinal), so it never reports on scores that
 * haven't happened. Same deterministic template approach as
 * getMatchupArticle above, just built from pre-game inputs: season-to-date
 * (or all-time, before the season has any games) records, head-to-head
 * history, and each roster's own career-scoring data instead of live points.
 */
export function getMatchupPreview(
  matchup: WeekMatchup,
  leagueId: string,
  season: string,
  week: number,
  careerPointsById: Map<string, number>,
  db: Database = getDb(),
): MatchupArticle | null {
  const [teamA, teamB] = matchup.teams;
  if (!teamA || !teamB) return null;

  const seed = `${leagueId}-${season}-${week}-${matchup.matchupId}-preview`;
  const paragraphs: string[] = [];

  const headline = template(`hl-${seed}`, [
    "Week {week} preview: {a} vs. {b}",
    "{a} takes on {b} in Week {week}",
  ], { a: teamA.managerName, b: teamB.managerName, week: String(week) });

  // Framing: this season's record so far, or all-time if the season hasn't
  // produced a game yet (week 1, before anyone has a current-season record).
  const standings = getSeasonStandings(leagueId, db);
  const standingByRoster = new Map(standings.map((s) => [s.rosterId, s]));
  const sA = standingByRoster.get(teamA.rosterId);
  const sB = standingByRoster.get(teamB.rosterId);
  const gamesA = sA ? sA.wins + sA.losses + sA.ties : 0;
  const gamesB = sB ? sB.wins + sB.losses + sB.ties : 0;

  if ((gamesA > 0 || gamesB > 0) && sA && sB) {
    paragraphs.push(
      template(`framing-current-${seed}`, [
        "{a} enters at {aRecord} ({aPf} PPG) against {b}, sitting at {bRecord} ({bPf} PPG).",
        "{a} ({aRecord}, {aPf} PPG) and {b} ({bRecord}, {bPf} PPG) face off this week.",
      ], {
        a: teamA.managerName,
        aRecord: fmtRecord(sA.wins, sA.losses, sA.ties),
        aPf: fmtPoints(gamesA > 0 ? sA.pf / gamesA : 0),
        b: teamB.managerName,
        bRecord: fmtRecord(sB.wins, sB.losses, sB.ties),
        bPf: fmtPoints(gamesB > 0 ? sB.pf / gamesB : 0),
      }),
    );
  } else {
    const career = getManagerCareerStats(db);
    const careerByUser = new Map(career.map((c) => [c.userId, c]));
    const cA = teamA.userId ? careerByUser.get(teamA.userId) : undefined;
    const cB = teamB.userId ? careerByUser.get(teamB.userId) : undefined;
    paragraphs.push(
      template(`framing-alltime-${seed}`, [
        "No games in the books yet this season, so it's all-time records for now: {a} is {aRecord}, {b} is {bRecord}.",
        "Season opener for these two. All-time, {a} sits at {aRecord} and {b} at {bRecord}.",
      ], {
        a: teamA.managerName,
        aRecord: cA ? fmtRecord(cA.wins, cA.losses, cA.ties) : "0-0",
        b: teamB.managerName,
        bRecord: cB ? fmtRecord(cB.wins, cB.losses, cB.ties) : "0-0",
      }),
    );
  }

  // Streak: worth a mention on its own once it's long enough to mean
  // something (a 1-game "streak" is just last week's result).
  const streakTeam = [sA, sB].find((s) => s && /^[WL][3-9]\d*$/.test(s.streak));
  if (streakTeam) {
    const team = streakTeam === sA ? teamA : teamB;
    const kind = streakTeam.streak[0] === "W" ? "win" : "loss";
    const verb = kind === "win" ? "won" : "lost";
    const count = streakTeam.streak.slice(1);
    paragraphs.push(
      template(`streak-${seed}`, [
        "{name} rides a {count}-game {kind} streak into this one.",
        "Worth noting: {name} has {verb} {count} straight coming in.",
      ], { name: team.managerName, count, kind, verb }),
    );
  }

  // Rivalry framing, when this pairing is a real one.
  const rivalry = rivalryParagraph(teamA, teamB, seed, db);
  if (rivalry) paragraphs.push(rivalry);

  // Head-to-head history
  if (teamA.userId && teamB.userId) {
    const h2h = getHeadToHeadForPair(teamA.userId, teamB.userId, db);
    if (h2h && h2h.games > 1) {
      paragraphs.push(
        template(`h2h-${seed}`, [
          "These two have history: {games} meetings, {record}. {note}",
          "Not their first dance. {record} across {games} matchups between them. {note}",
        ], {
          games: String(h2h.games),
          record: h2h.wins === h2h.losses ? `dead even at ${h2h.wins}-${h2h.losses}` : `${h2h.wins}-${h2h.losses}`,
          note:
            h2h.wins === h2h.losses
              ? "Anyone's game."
              : `${h2h.wins > h2h.losses ? teamA.managerName : teamB.managerName} has had the upper hand so far.`,
        }),
      );
    } else {
      paragraphs.push(
        template(`h2h-first-${seed}`, [
          "First time these two have squared off. No history to lean on here.",
          "A fresh matchup: these two haven't played enough to have a real rivalry file yet.",
        ], {}),
      );
    }
  }

  // A little modeled analysis: the same spread/win-probability the Betting
  // Odds page already computes for this matchup.
  const analysis = analysisParagraph(teamA, teamB, week, seed, db);
  if (analysis) paragraphs.push(analysis);

  // One to watch: the highest career-scoring starter in either lineup.
  const allStarters = [...teamA.starters, ...teamB.starters].filter((p) => p.playerId !== "0");
  const topStarter = allStarters
    .map((p) => ({ player: p, career: careerPointsById.get(p.playerId) ?? 0 }))
    .sort((a, b) => b.career - a.career)[0];
  if (topStarter && topStarter.career > 0) {
    const starterTeam = teamA.starters.includes(topStarter.player) ? teamA : teamB;
    paragraphs.push(
      template(`watch-${seed}`, [
        "One to watch: {name} ({team}) has put up {pts} career points in this league, the most proven scorer in this matchup.",
        "Keep an eye on {name}, starting for {team} with {pts} career points to their name.",
      ], { name: topStarter.player.name, team: starterTeam.managerName, pts: String(Math.round(topStarter.career)) }),
    );
  }

  // Questionable lineup call: a benched player who's out-produced, for their
  // career, the starter at the same position.
  const flagA = findQuestionableStart(teamA, careerPointsById);
  const flagB = findQuestionableStart(teamB, careerPointsById);
  const flag = flagA ?? flagB;
  const flagTeam = flagA ? teamA : teamB;
  if (flag) {
    paragraphs.push(
      template(`bench-flag-${seed}`, [
        "Questionable call: {benchName} ({benchPts} career points) is stuck on {team}'s bench while {starterName} ({starterPts}) gets the start at {pos}.",
        "{team} is sitting {benchName}, who has outscored starting {pos} {starterName} over their careers, {benchPts} to {starterPts}.",
      ], {
        team: flagTeam.managerName,
        benchName: flag.benchPlayer.name,
        starterName: flag.starter.name,
        pos: flag.starter.position,
        benchPts: String(Math.round(flag.benchCareer)),
        starterPts: String(Math.round(flag.starterCareer)),
      }),
    );
  }

  return { headline, paragraphs };
}
