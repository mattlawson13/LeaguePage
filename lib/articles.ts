import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentLeague, getNflState, isWeekFinal } from "./league";
import { getWeekMatchups } from "./matchups";
import { getMatchupArticle } from "./beatWriter";
import { computePowerRankings } from "./powerRankings";
import { getTrendingPlayers } from "./news";
import { fmtPoints } from "./format";

/**
 * "Articles" is a chronological feed built entirely from content this site
 * already generates elsewhere (matchup recaps, power rankings, trending
 * waiver activity), plus a trash-talk category that's new here. Same
 * deterministic-template approach as everything else, no live LLM call.
 */

export type ArticleCategory = "recap" | "power-rankings" | "trash-talk" | "buzz";

export interface Article {
  id: string;
  category: ArticleCategory;
  title: string;
  paragraphs: string[];
  season: string;
  week: number | null;
}

function hashPick<T>(seed: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return options[Math.abs(h) % options.length];
}

function template(seed: string, options: string[], vars: Record<string, string>): string {
  const chosen = hashPick(seed, options);
  return chosen.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

const CATEGORY_ORDER: ArticleCategory[] = ["power-rankings", "trash-talk", "recap", "buzz"];

function trashTalkArticle(
  leagueId: string,
  season: string,
  week: number,
  db: Database,
): Article | null {
  const matchups = getWeekMatchups(leagueId, week, db);
  let blowout: { winner: string; loser: string; margin: number; winnerPts: number; loserPts: number } | null = null;
  for (const m of matchups) {
    const [a, b] = m.teams;
    if (!a || !b) continue;
    const margin = Math.abs(a.points - b.points);
    const winner = a.points >= b.points ? a : b;
    const loser = a.points >= b.points ? b : a;
    if (!blowout || margin > blowout.margin) {
      blowout = { winner: winner.managerName, loser: loser.managerName, margin, winnerPts: winner.points, loserPts: loser.points };
    }
  }
  if (!blowout || blowout.margin < 15) return null;

  const seed = `trash-${leagueId}-${season}-${week}`;
  const title = template(`trash-title-${seed}`, [
    "{loser} owes {winner} an apology",
    "Somebody check on {loser}",
    "{loser} did not see that coming",
    "Rough week to be {loser}",
  ], { winner: blowout.winner, loser: blowout.loser });

  const vars = {
    winner: blowout.winner,
    loser: blowout.loser,
    margin: fmtPoints(blowout.margin),
    winnerPts: fmtPoints(blowout.winnerPts),
    loserPts: fmtPoints(blowout.loserPts),
  };

  const paragraphs = [
    template(`trash-body-${seed}`, [
      "{winner} put {margin} points between themselves and {loser} this week. That's not a loss, that's a message.",
      "{loser} lost by {margin} to {winner}. The group chat should not let this go.",
      "{winner} could've let off the gas against {loser} and still won by two touchdowns. They did not let off the gas.",
      "{winnerPts} to {loserPts}. {loser} can run it back next year and it probably still ends the same way.",
      "Nobody made {winner} run up the score on {loser}. They did it anyway.",
    ], vars),
    template(`trash-body2-${seed}`, [
      "{loser} should screenshot the box score now, before someone talks them out of it being that bad. It was that bad.",
      "Somewhere, {loser} is telling themselves this was a bye week in disguise. It wasn't.",
      "{winner} isn't going to let this one go quietly, and honestly, why should they.",
    ], vars),
  ];

  return { id: `trash-${season}-${week}`, category: "trash-talk", title, paragraphs, season, week };
}

function powerRankingsArticle(season: string, week: number, db: Database): Article | null {
  const rankings = computePowerRankings(db);
  if (rankings.length === 0) return null;

  const leader = rankings[0];
  const withMovement = rankings.filter((r) => r.movement !== null);
  const riser = [...withMovement].sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0))[0];
  const faller = [...withMovement].sort((a, b) => (a.movement ?? 0) - (b.movement ?? 0))[0];

  const seed = `power-${season}-${week}`;
  const paragraphs: string[] = [
    template(`power-lede-${seed}`, [
      "{name} sits atop this week's power rankings, and the tag says it all: {tag}.",
      "The power rankings have {name} at number one this week ({tag}).",
      "Nobody's catching {name} at the top of the power rankings right now: {tag}.",
    ], { name: leader.displayName, tag: leader.tag.toLowerCase() }),
  ];

  if (riser && riser.movement && riser.movement >= 2) {
    paragraphs.push(
      template(`power-riser-${seed}`, [
        "Biggest mover: {name} climbed {spots} spots this week.",
        "{name} is trending up, {spots} spots better than last week.",
        "{name} is the riser of the week, up {spots} spots.",
      ], { name: riser.displayName, spots: String(riser.movement) }),
    );
  }
  if (faller && faller.movement && faller.movement <= -2 && faller.rosterId !== riser?.rosterId) {
    paragraphs.push(
      template(`power-faller-${seed}`, [
        "Free fall: {name} dropped {spots} spots this week.",
        "Rough week for the rankings: {name} fell {spots} spots.",
        "{name} is the faller of the week, down {spots} spots.",
      ], { name: faller.displayName, spots: String(Math.abs(faller.movement)) }),
    );
  }

  return {
    id: `power-${season}-${week}`,
    category: "power-rankings",
    title: template(`power-title-${seed}`, [
      "Power rankings: {name} takes the top spot",
      "This week's power rankings, led by {name}",
    ], { name: leader.displayName }),
    paragraphs,
    season,
    week,
  };
}

function buzzArticle(season: string, week: number, db: Database): Article | null {
  const trending = getTrendingPlayers(db).filter((t) => t.type === "add");
  const top = trending[0];
  if (!top) return null;

  const seed = `buzz-${season}-${week}`;
  const paragraphs = [
    template(seed, [
      "The waiver wire's most-added player across all of Sleeper right now: {name}{team}, picked up {count} times leaguewide.",
      "{name}{team} is the hottest add on Sleeper this week, added {count} times across the platform.",
    ], {
      name: top.name,
      team: top.team ? ` (${top.team})` : "",
      count: top.count.toLocaleString(),
    }),
  ];

  return {
    id: `buzz-${season}-${week}`,
    category: "buzz",
    title: "Around the waiver wire",
    paragraphs,
    season,
    week,
  };
}

export function getArticles(db: Database = getDb()): Article[] {
  const league = getCurrentLeague(db);
  if (!league) return [];

  const season = league.season;
  // isWeekFinal() itself is keyed off nfl_state.week (not display_week, which
  // lags behind it during Sleeper's own weekly rollover) so the loop bound
  // here has to match that same raw counter, or a week isWeekFinal already
  // considers done can sit here un-covered until display_week catches up.
  const statWeek = getNflState(db)?.week ?? 1;
  const articles: Article[] = [];

  for (let week = 1; week < statWeek; week++) {
    if (!isWeekFinal(season, week, db)) continue;
    const matchups = getWeekMatchups(league.league_id, week, db);
    if (matchups.length === 0) continue;

    for (const m of matchups) {
      const article = getMatchupArticle(m, league.league_id, season, week, db);
      if (article) {
        articles.push({
          id: `recap-${season}-${week}-${m.matchupId}`,
          category: "recap",
          title: article.headline,
          paragraphs: article.paragraphs,
          season,
          week,
        });
      }
    }

    const trash = trashTalkArticle(league.league_id, season, week, db);
    if (trash) articles.push(trash);
  }

  const latestPlayedWeek = statWeek - 1;
  if (latestPlayedWeek >= 1) {
    const power = powerRankingsArticle(season, latestPlayedWeek, db);
    if (power) articles.push(power);
    const buzz = buzzArticle(season, latestPlayedWeek, db);
    if (buzz) articles.push(buzz);
  }

  return articles.sort((a, b) => {
    if ((b.week ?? 0) !== (a.week ?? 0)) return (b.week ?? 0) - (a.week ?? 0);
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}
