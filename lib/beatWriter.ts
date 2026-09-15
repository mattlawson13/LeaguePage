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
 * a deterministic hash-template approach (seeded by matchup/season/week so
 * re-rendering the same week is stable) rather than a live LLM call, since
 * the site otherwise has no LLM API integration or key. Free, no new
 * dependency, no ongoing per-request cost.
 *
 * To avoid reading as a fill-in-the-blank template, every article varies
 * two independent things: which "beats" (h2h, lineup regret, a rivalry
 * angle, etc.) actually appear and in what order, and which of several
 * phrasings gets used for each one that does. Only the lede and the closing
 * kicker are fixed in position, matching how a real recap is structured
 * (lead with the result, close with a take), but both draw from large
 * phrase banks and are built as single flowing sentences, not a fact dump.
 */

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return Math.abs(h);
}

function hashPick<T>(seed: string, options: T[]): T {
  return options[hashSeed(seed) % options.length];
}

function template(seed: string, options: string[], vars: Record<string, string>): string {
  const chosen = hashPick(seed, options);
  return chosen.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

/** Deterministic Fisher-Yates: same seed always produces the same order. */
function seededShuffle<T>(seed: string, arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = hashSeed(`${seed}-shuffle-${i}`) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function seededCount(seed: string, min: number, max: number): number {
  if (max <= min) return min;
  return min + (hashSeed(`${seed}-count`) % (max - min + 1));
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

/**
 * Rivalry framing, checked in order of how deliberate the rivalry is: a
 * hand-tagged relationship (married/dating couples playing each other)
 * beats a hand-tagged named rivalry, which beats an auto-detected one (a
 * close, well-played series nobody's bothered to name). Most matchups are
 * none of these, and stay silent rather than force "rivalry" language onto
 * an ordinary pairing.
 */
function rivalryParagraph(teamA: MatchupTeam, teamB: MatchupTeam, seed: string, db: Database): string | null {
  if (!teamA.userId || !teamB.userId) return null;
  const managers = resolveManagers(db);
  const mA = managers.find((m) => m.userId === teamA.userId);
  const mB = managers.find((m) => m.userId === teamB.userId);
  if (!mA || !mB) return null;

  if (isHouseDivided(mA, mB)) {
    return template(`rivalry-house-${seed}`, [
      "This one's a house divided: {a} and {b} go home together no matter who wins tonight.",
      "Nothing like a little tension at home: {a} and {b} share more than a roof, they share this rivalry.",
      "Spare a thought for whichever one of {a} and {b} has to sleep next to the winner tonight.",
    ], { a: teamA.managerName, b: teamB.managerName });
  }
  if (isNamedPair(mA, mB)) {
    return template(`rivalry-named-${seed}`, [
      "Circle this one: {a} vs. {b} is one of this league's marquee rivalries.",
      "This is personal. {a} and {b} have had each other's numbers saved for a while.",
      "Everybody else's matchup this week is just a matchup. This is {a} and {b}.",
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

// --- Post-game recap ------------------------------------------------------

type GameTier = "blowout" | "nailbiter" | "normal";

function tierOf(margin: number): GameTier {
  if (margin >= 30) return "blowout";
  if (margin <= 5) return "nailbiter";
  return "normal";
}

const HEADLINES: Record<GameTier, string[]> = {
  blowout: [
    "{winner} runs away from {loser}",
    "{winner} makes quick work of {loser}",
    "No contest: {winner} buries {loser}",
    "{winner} sends a message to {loser}",
  ],
  nailbiter: [
    "{winner} survives {loser} in a nail-biter",
    "{winner} edges {loser} down to the wire",
    "{winner} outlasts {loser} in a coin flip",
    "{winner} escapes {loser} by a whisker",
  ],
  normal: [
    "{winner} takes down {loser}",
    "{winner} gets the better of {loser}",
    "{winner} handles {loser}",
    "{winner} moves past {loser}",
  ],
};

const LEDES: Record<GameTier, string[]> = {
  blowout: [
    "{winner} didn't just beat {loser} this week, they buried them, {winnerPts} to {loserPts}, and the {margin}-point gap says everything about how competitive this actually was. It wasn't.",
    "Final: {winner} {winnerPts}, {loser} {loserPts}. A {margin}-point margin like that isn't a loss for {loser}, it's a cautionary tale.",
    "{loser} showed up, put a roster on the field, and got run off it, {winnerPts} to {loserPts}, by {winner}.",
    "There was a fantasy matchup, and then there was whatever {winner} did to {loser}: {winnerPts} to {loserPts}, a {margin}-point statement.",
    "{winner} {winnerPts}, {loser} {loserPts}. Nothing subtle about a {margin}-point win. This one was over before the late window even mattered.",
    "Somebody tell {loser} the good news: it's over. {winner} closed this out {winnerPts} to {loserPts}, a {margin}-point rout that was never really in doubt.",
  ],
  nailbiter: [
    "{winner} escaped with the win, {winnerPts} to {loserPts}, a {margin}-point margin that came down to whichever stat correction landed last.",
    "This one had no business being close, but {winner} needed every bit of {winnerPts} to hold off {loser}'s {loserPts}.",
    "{winner} {winnerPts}, {loser} {loserPts}. Separate those two lineups by {margin} points and either manager could argue they deserved this one.",
    "A {margin}-point final: {winner} {winnerPts}, {loser} {loserPts}. {loser} will replay every lineup decision from this week trying to find those points.",
    "{winner} survives, barely, {winnerPts} to {loserPts}. Finishes like this {margin}-point nail-biter are exactly why nobody sets a lineup and forgets it.",
    "Down to the wire: {winner} outlasted {loser}, {winnerPts} to {loserPts}, in a {margin}-point finish neither side will forget soon.",
  ],
  normal: [
    "{winner} handled business against {loser} this week, {winnerPts} to {loserPts}, a {margin}-point win that was comfortable without ever getting silly.",
    "{winner} {winnerPts}, {loser} {loserPts}. A clean {margin}-point win, the kind that doesn't make a highlight package but pads a record just fine.",
    "{loser} put up {loserPts} and still came up {margin} points short of {winner}'s {winnerPts}.",
    "Final from this one: {winner} {winnerPts}, {loser} {loserPts}. Not a rout, not a nail-biter, just a {margin}-point win {loser} will feel for a few days.",
    "{winner} took this one {winnerPts} to {loserPts}. {loser} had a pulse but never had the lead when it counted, falling by {margin}.",
    "{winner} did enough, {winnerPts} to {loser}'s {loserPts}, cruising to a {margin}-point win that never really felt threatened.",
  ],
};

interface RecapContext {
  teamA: MatchupTeam;
  teamB: MatchupTeam;
  winner: MatchupTeam;
  loser: MatchupTeam;
  margin: number;
  tier: GameTier;
  seed: string;
  leagueId: string;
  db: Database;
}

function h2hBeat(ctx: RecapContext): string | null {
  const { winner, loser, seed, db } = ctx;
  if (!winner.userId || !loser.userId) return null;
  const h2h = getHeadToHeadForPair(winner.userId, loser.userId, db);
  if (h2h && h2h.games > 1) {
    const leaderIsWinner = h2h.wins >= h2h.losses;
    return template(`h2h-${seed}`, [
      "These two have history: {games} meetings, {record}. {note}",
      "Not their first dance. {record} across {games} matchups between them. {note}",
      "This series is {games} games deep now, {record}. {note}",
    ], {
      games: String(h2h.games),
      record: h2h.wins === h2h.losses ? `dead even at ${h2h.wins}-${h2h.losses}` : `${h2h.wins}-${h2h.losses}`,
      note:
        h2h.wins === h2h.losses
          ? "Nobody has the edge yet."
          : leaderIsWinner
            ? "The trend held again this week."
            : "The trend broke this week.",
    });
  }
  return template(`h2h-first-${seed}`, [
    "First time these two have squared off. No history to lean on yet.",
    "A fresh matchup: these two haven't played enough to have a real rivalry file.",
    "New pairing, no track record. That'll change after this one.",
  ], {});
}

function lineupBeat(ctx: RecapContext, league: RosterPositionsRow | undefined): string | null {
  if (!league) return null;
  const { teamA, teamB, seed } = ctx;
  const rosterPositions = JSON.parse(league.roster_positions_json) as string[];
  const optA = optimalLineupFor(teamA, rosterPositions);
  const optB = optimalLineupFor(teamB, rosterPositions);
  const worse = optA.pointsLeftOnBench >= optB.pointsLeftOnBench ? { team: teamA, opt: optA } : { team: teamB, opt: optB };
  if (worse.opt.pointsLeftOnBench > 1) {
    return template(`lineup-${seed}`, [
      "{name}'s bench tells a story: {pts} points sat there unused this week. That's not bad luck, that's a lineup mistake.",
      "Lineup IQ check: {name} left {pts} points on the bench that could've been in the starting lineup.",
      "{name} beat themselves a little here, too, leaving {pts} points parked on the bench.",
      "Somewhere in {name}'s bench is {pts} points that never got a chance to matter.",
    ], { name: worse.team.managerName, pts: fmtPoints(worse.opt.pointsLeftOnBench) });
  }
  return template(`lineup-clean-${seed}`, [
    "Both sides played it close to optimal this week. Not much lineup regret on either bench.",
    "Clean week for both lineups: neither manager left much on the table.",
    "No real what-ifs on the bench for either team this week.",
  ], {});
}

function starBeat(ctx: RecapContext, star: MatchupPlayer, starTeam: MatchupTeam): string {
  const { seed } = ctx;
  const isWinner = starTeam === ctx.winner;
  return template(`star-${seed}`, isWinner
    ? [
        "{name} was the story for {team}: {pts} points at {pos}, the kind of week that wins leagues, not just weeks.",
        "Credit where it's due: {name} went off for {team}, {pts} points at {pos}, and made this one look easy.",
        "{team} can thank {name} directly. {pts} points at {pos} is most of the winning margin right there.",
        "{name} carried {team} this week, dropping {pts} points at {pos}.",
      ]
    : [
        "{name} put up {pts} points at {pos} for {team} in a losing effort, the kind of stat line that deserved a better supporting cast.",
        "Wasted masterpiece: {name} scored {pts} for {team}, and it still wasn't enough.",
        "{team} got a real week from {name} ({pts} points at {pos}). Everybody else, not so much.",
      ], { name: star.name, team: starTeam.managerName, pts: fmtPoints(star.points), pos: star.position });
}

function bustBeat(ctx: RecapContext, bust: MatchupPlayer, bustTeam: MatchupTeam): string {
  const { seed } = ctx;
  return template(`bust-${seed}`, [
    "Not so much from {name}, who started for {team} and managed just {pts} points.",
    "{team} got nothing from {name} this week, {pts} points from the starting {pos} spot.",
    "Special mention to {name}, whose {pts} points from the starting {pos} spot did {team} zero favors.",
    "{team} trotted {name} out at {pos} and got {pts} points for the trouble.",
  ], { name: bust.name, team: bustTeam.managerName, pts: fmtPoints(bust.points), pos: bust.position });
}

function recordAfterBeat(ctx: RecapContext, standings: ReturnType<typeof getSeasonStandings>): string | null {
  const { winner, loser, seed } = ctx;
  const wRow = standings.find((s) => s.rosterId === winner.rosterId);
  const lRow = standings.find((s) => s.rosterId === loser.rosterId);
  if (!wRow || !lRow) return null;
  return template(`record-${seed}`, [
    "{winner} moves to {wRecord}. {loser} slides to {lRecord}.",
    "That puts {winner} at {wRecord} on the season, with {loser} now {lRecord}.",
    "{winner} improves to {wRecord}; {loser} falls to {lRecord}.",
  ], {
    winner: winner.managerName,
    loser: loser.managerName,
    wRecord: fmtRecord(wRow.wins, wRow.losses, wRow.ties),
    lRecord: fmtRecord(lRow.wins, lRow.losses, lRow.ties),
  });
}

const KICKERS: Record<GameTier, string[]> = {
  blowout: [
    "There's no moral victory to mine here. {loser} got outcoached, outscored, and out-classed. {winner} should screenshot this box score for the group chat.",
    "{loser}, this is your sign to actually look at your bench before kickoff next week. {winner} didn't just win, they made a point.",
    "If {loser} is looking for excuses, the box score isn't going to hand them any. {winner} earned every bit of this one.",
    "{winner} adds a signature win to the resume. {loser} adds this week to the list of things to never bring up again.",
    "Nobody circles a {margin}-point loss on the calendar to relive it. {loser} will want to forget this week happened; {winner} will not let them.",
  ],
  nailbiter: [
    "Neither manager should feel great about this one. {winner} got away with it, and {loser} will spend the week wondering how {margin} points slipped away.",
    "This is the kind of week where the box score flatters nobody. {winner} wins, sure, but a {margin}-point margin is a coin flip that landed their way.",
    "{winner} takes it, {loser} takes the loss, and both benches probably have a player or two they wish they'd started. {margin} points is nothing.",
    "Somewhere between {winner}'s celebration and {loser}'s complaints about a bad beat is the truth: this one was there for either team, and one of them finally took it.",
  ],
  normal: [
    "{winner} did what good teams do: took care of business. {loser} will get more chances, just not against this level of competition this week.",
    "Nothing flashy from {winner}, just a clean {margin}-point win that {loser} never really threatened.",
    "{loser} put up a fight but never had an answer. {winner} moves on; {loser} goes back to the drawing board.",
    "{winner} controlled this one from the jump. {loser} had the box score of a team that knew it early too.",
  ],
};

function kickerBeat(ctx: RecapContext, star: MatchupPlayer | null, starTeam: MatchupTeam | null, bust: MatchupPlayer | null, bustTeam: MatchupTeam | null): string {
  const { winner, loser, margin, tier, seed } = ctx;
  const base = template(`kicker-${seed}`, KICKERS[tier], {
    winner: winner.managerName,
    loser: loser.managerName,
    margin: fmtPoints(margin),
  });

  // Occasionally tack on one more specific, evidence-based jab or hype line
  // rather than always stopping at the general take.
  const addOn = hashSeed(`${seed}-addon`) % 2 === 0;
  if (!addOn) return base;

  if (bust && bustTeam === loser) {
    const extra = template(`kicker-bust-${seed}`, [
      " {name} at {pos} scored {pts} for {team}. That's the kind of afternoon that gets a bench spot revoked.",
      " And {name} starting at {pos} for {team}? {pts} points. That's on the manager, not the matchup.",
    ], { name: bust.name, pos: bust.position, pts: fmtPoints(bust.points), team: loser.managerName });
    return base + extra;
  }
  if (star && starTeam === winner) {
    const extra = template(`kicker-star-${seed}`, [
      " {name} deserves the game ball: {pts} points at {pos} for {team}.",
      " None of this happens for {team} without {name}'s {pts} points at {pos}.",
    ], { name: star.name, pos: star.position, pts: fmtPoints(star.points), team: winner.managerName });
    return base + extra;
  }
  return base;
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
  const tier = tierOf(margin);

  const ctx: RecapContext = { teamA, teamB, winner, loser, margin, tier, seed, leagueId, db };

  const headline = template(`hl-${seed}`, HEADLINES[tier], {
    winner: winner.managerName,
    loser: loser.managerName,
  });

  const lede = template(`lede-${seed}`, LEDES[tier], {
    winner: winner.managerName,
    loser: loser.managerName,
    winnerPts: fmtPoints(winner.points),
    loserPts: fmtPoints(loser.points),
    margin: fmtPoints(margin),
  });

  const bestA = topPerformer(teamA);
  const bestB = topPerformer(teamB);
  const stars = [bestA, bestB].filter((p): p is MatchupPlayer => Boolean(p) && p!.points > 0);
  const star = stars.sort((a, b) => b.points - a.points)[0] ?? null;
  const starTeam = star ? (teamA.starters.includes(star) ? teamA : teamB) : null;

  const bustCandidates = [biggestBust(teamA), biggestBust(teamB)].filter(
    (p): p is MatchupPlayer => Boolean(p) && p!.position !== "DEF" && p!.points < 5 && p!.playerId !== star?.playerId,
  );
  const bust = bustCandidates[0] ?? null;
  const bustTeam = bust ? (teamA.starters.includes(bust) ? teamA : teamB) : null;

  const league = db.prepare(`SELECT roster_positions_json FROM leagues WHERE league_id = ?`).get(leagueId) as
    | RosterPositionsRow
    | undefined;
  const standings = getSeasonStandings(leagueId, db);

  // Middle beats: build whichever ones have content, then take a random
  // (seeded) subset in a random order, so no two weeks read the same shape.
  const candidates: string[] = [];
  const h2h = h2hBeat(ctx);
  if (h2h) candidates.push(h2h);
  const lineup = lineupBeat(ctx, league);
  if (lineup) candidates.push(lineup);
  if (star && starTeam) candidates.push(starBeat(ctx, star, starTeam));
  if (bust && bustTeam) candidates.push(bustBeat(ctx, bust, bustTeam));
  const rivalry = rivalryParagraph(teamA, teamB, seed, db);
  if (rivalry) candidates.push(rivalry);
  const recordAfter = recordAfterBeat(ctx, standings);
  if (recordAfter) candidates.push(recordAfter);

  const take = seededCount(seed, Math.min(3, candidates.length), candidates.length);
  const middle = seededShuffle(seed, candidates).slice(0, take);

  const kicker = kickerBeat(ctx, star, starTeam, bust, bustTeam);

  return { headline, paragraphs: [lede, ...middle, kicker] };
}

// --- Pre-game preview -------------------------------------------------

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
): { text: string; favorite: MatchupTeam; dog: MatchupTeam; favoriteWinPct: number } | null {
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
    return {
      text: template(`analysis-pickem-${seed}`, [
        "By the numbers, this one's a true pick'em: {a} and {b} project within a point of each other, {total} combined.",
        "The model can't separate these two. Call it a coin flip, with {total} points on the board between them.",
      ], { a: teamA.managerName, b: teamB.managerName, total: fmtPoints(line.total) }),
      favorite,
      dog,
      favoriteWinPct: 50,
    };
  }

  return {
    text: template(`analysis-line-${seed}`, [
      "By the numbers: {favorite} projects as a {spread}-point favorite over {dog}, a {pct}% implied chance to win, with {total} total points on the board.",
      "The model likes {favorite} here, favored by {spread} over {dog} ({pct}% implied), with a projected total of {total}.",
    ], {
      favorite: favorite.managerName,
      dog: dog.managerName,
      spread: spreadPts,
      pct: String(favoriteWinPct),
      total: fmtPoints(line.total),
    }),
    favorite,
    dog,
    favoriteWinPct,
  };
}

const PREVIEW_HEADLINES = [
  "Week {week} preview: {a} vs. {b}",
  "{a} takes on {b} in Week {week}",
  "Setting the stage: {a} and {b} in Week {week}",
];

const PREVIEW_KICKERS = [
  "{dog} is going to need more than hope to pull this off. {titles} career title{plural} won't move the needle here.",
  "If {dog} wants to make this interesting, it starts with not beating themselves. {favorite} won't need the help.",
  "The numbers favor {favorite}, and {dog} hasn't exactly made a habit of proving the model wrong.",
  "{favorite} is favored here and should act like it. {dog} has a puncher's chance and not much else.",
];

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

  const headline = template(`hl-${seed}`, PREVIEW_HEADLINES, { a: teamA.managerName, b: teamB.managerName, week: String(week) });

  // Framing: this season's record so far, or all-time if the season hasn't
  // produced a game yet (week 1, before anyone has a current-season record).
  const standings = getSeasonStandings(leagueId, db);
  const standingByRoster = new Map(standings.map((s) => [s.rosterId, s]));
  const sA = standingByRoster.get(teamA.rosterId);
  const sB = standingByRoster.get(teamB.rosterId);
  const gamesA = sA ? sA.wins + sA.losses + sA.ties : 0;
  const gamesB = sB ? sB.wins + sB.losses + sB.ties : 0;

  const career = getManagerCareerStats(db);
  const careerByUser = new Map(career.map((c) => [c.userId, c]));
  const cA = teamA.userId ? careerByUser.get(teamA.userId) : undefined;
  const cB = teamB.userId ? careerByUser.get(teamB.userId) : undefined;

  const lede =
    (gamesA > 0 || gamesB > 0) && sA && sB
      ? template(`framing-current-${seed}`, [
          "{a} enters at {aRecord} ({aPf} PPG) against {b}, sitting at {bRecord} ({bPf} PPG).",
          "{a} ({aRecord}, {aPf} PPG) and {b} ({bRecord}, {bPf} PPG) face off this week.",
          "{a} brings a {aRecord} record and {aPf} PPG into a matchup with {b}, who sits at {bRecord} and {bPf} PPG.",
        ], {
          a: teamA.managerName,
          aRecord: fmtRecord(sA.wins, sA.losses, sA.ties),
          aPf: fmtPoints(gamesA > 0 ? sA.pf / gamesA : 0),
          b: teamB.managerName,
          bRecord: fmtRecord(sB.wins, sB.losses, sB.ties),
          bPf: fmtPoints(gamesB > 0 ? sB.pf / gamesB : 0),
        })
      : template(`framing-alltime-${seed}`, [
          "No games in the books yet this season, so it's all-time records for now: {a} is {aRecord}, {b} is {bRecord}.",
          "Season opener for these two. All-time, {a} sits at {aRecord} and {b} at {bRecord}.",
          "First look of the year at {a} ({aRecord} all-time) and {b} ({bRecord} all-time).",
        ], {
          a: teamA.managerName,
          aRecord: cA ? fmtRecord(cA.wins, cA.losses, cA.ties) : "0-0",
          b: teamB.managerName,
          bRecord: cB ? fmtRecord(cB.wins, cB.losses, cB.ties) : "0-0",
        });

  // Middle beats, built if they have content, then randomly (seeded)
  // subset-and-shuffled so previews don't all share one shape.
  const candidates: string[] = [];

  const streakTeam = [sA, sB].find((s) => s && /^[WL][3-9]\d*$/.test(s.streak));
  if (streakTeam) {
    const team = streakTeam === sA ? teamA : teamB;
    const kind = streakTeam.streak[0] === "W" ? "win" : "loss";
    const verb = kind === "win" ? "won" : "lost";
    const count = streakTeam.streak.slice(1);
    candidates.push(
      template(`streak-${seed}`, [
        "{name} rides a {count}-game {kind} streak into this one.",
        "Worth noting: {name} has {verb} {count} straight coming in.",
        "{name} is hot (or cold): {count} straight {kind}s heading into this week.",
      ], { name: team.managerName, count, kind, verb }),
    );
  }

  const rivalry = rivalryParagraph(teamA, teamB, seed, db);
  if (rivalry) candidates.push(rivalry);

  if (teamA.userId && teamB.userId) {
    const h2h = getHeadToHeadForPair(teamA.userId, teamB.userId, db);
    if (h2h && h2h.games > 1) {
      candidates.push(
        template(`h2h-${seed}`, [
          "These two have history: {games} meetings, {record}. {note}",
          "Not their first dance. {record} across {games} matchups between them. {note}",
          "The series stands at {record} through {games} meetings. {note}",
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
      candidates.push(
        template(`h2h-first-${seed}`, [
          "First time these two have squared off. No history to lean on here.",
          "A fresh matchup: these two haven't played enough to have a real rivalry file yet.",
        ], {}),
      );
    }
  }

  const analysis = analysisParagraph(teamA, teamB, week, seed, db);
  if (analysis) candidates.push(analysis.text);

  const allStarters = [...teamA.starters, ...teamB.starters].filter((p) => p.playerId !== "0");
  const topStarter = allStarters
    .map((p) => ({ player: p, career: careerPointsById.get(p.playerId) ?? 0 }))
    .sort((a, b) => b.career - a.career)[0];
  if (topStarter && topStarter.career > 0) {
    const starterTeam = teamA.starters.includes(topStarter.player) ? teamA : teamB;
    candidates.push(
      template(`watch-${seed}`, [
        "One to watch: {name} ({team}) has put up {pts} career points in this league, the most proven scorer in this matchup.",
        "Keep an eye on {name}, starting for {team} with {pts} career points to their name.",
        "{name} brings {pts} career points to {team}'s lineup, more than anyone else on the field this week.",
      ], { name: topStarter.player.name, team: starterTeam.managerName, pts: String(Math.round(topStarter.career)) }),
    );
  }

  const flagA = findQuestionableStart(teamA, careerPointsById);
  const flagB = findQuestionableStart(teamB, careerPointsById);
  const flag = flagA ?? flagB;
  const flagTeam = flagA ? teamA : teamB;
  if (flag) {
    candidates.push(
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

  const take = seededCount(seed, Math.min(3, candidates.length), candidates.length);
  const middle = seededShuffle(seed, candidates).slice(0, take);

  const paragraphs = [lede, ...middle];

  // Kicker: a grounded, needling prediction, only when the model actually
  // has a clear favorite (skipping the pick'em case, where trash talk about
  // a "dog" would be nonsense).
  if (analysis && Math.abs(analysis.favoriteWinPct - 50) >= 3) {
    const dogCareer = analysis.dog.userId ? careerByUser.get(analysis.dog.userId) : undefined;
    const titles = dogCareer?.titles ?? 0;
    paragraphs.push(
      template(`preview-kicker-${seed}`, PREVIEW_KICKERS, {
        favorite: analysis.favorite.managerName,
        dog: analysis.dog.managerName,
        titles: String(titles),
        plural: titles === 1 ? "" : "s",
      }),
    );
  }

  return { headline, paragraphs };
}
