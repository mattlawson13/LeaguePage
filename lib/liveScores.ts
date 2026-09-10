// Live NFL game scores, straight from ESPN's public (unauthenticated, but
// undocumented) scoreboard API. This is the only place in the app that
// calls it, and only from a request-time API route (never from ingest and
// never written to the committed DB) since the whole point is that it
// reflects whatever is happening in the NFL right now.
//
// Undocumented means it could change shape or disappear without notice.
// If it ever starts failing, the live scoreboard degrades to "unavailable"
// rather than breaking the rest of the site (fantasy points still come
// straight from Sleeper, unaffected by this).

import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

// Sleeper and ESPN mostly agree on team abbreviations; Washington is the
// one known mismatch (Sleeper: WAS, ESPN: WSH).
const ESPN_TO_SLEEPER_TEAM: Record<string, string> = { WSH: "WAS" };

function normalizeTeam(abbr: string): string {
  return ESPN_TO_SLEEPER_TEAM[abbr] ?? abbr;
}

export interface LiveGame {
  espnEventId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  state: "pre" | "in" | "post";
  statusDetail: string;
  homeWinPct: number | null;
  awayWinPct: number | null;
}

interface EspnCompetitor {
  team: { abbreviation: string };
  score?: string;
  homeAway: "home" | "away";
}

interface EspnEvent {
  id: string;
  competitions: {
    competitors: EspnCompetitor[];
    status: { type: { state: "pre" | "in" | "post"; detail: string; shortDetail: string } };
  }[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ESPN API ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function getWinProbability(eventId: string): Promise<number | null> {
  try {
    const summary = await fetchJson<{ winprobability?: { homeWinPercentage: number }[] }>(
      `${SUMMARY_URL}?event=${eventId}`,
    );
    const wp = summary.winprobability;
    if (!wp || wp.length === 0) return null;
    return wp[wp.length - 1].homeWinPercentage * 100;
  } catch {
    return null;
  }
}

/**
 * Live scores for one NFL week. `week`/`season` should be the real NFL
 * week (nfl_state), not the fantasy league's week number, though for a
 * standard league they're the same.
 */
export async function getLiveScoreboard(season: string, week: number): Promise<LiveGame[]> {
  const data = await fetchJson<{ events: EspnEvent[] }>(
    `${SCOREBOARD_URL}?year=${season}&seasontype=2&week=${week}`,
  );

  const games = data.events.map((e) => {
    const comp = e.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    return {
      espnEventId: e.id,
      homeTeam: normalizeTeam(home?.team.abbreviation ?? "?"),
      awayTeam: normalizeTeam(away?.team.abbreviation ?? "?"),
      homeScore: Number(home?.score ?? 0),
      awayScore: Number(away?.score ?? 0),
      state: comp.status.type.state,
      statusDetail: comp.status.type.shortDetail,
    };
  });

  // Only fetch win probability for games actually in progress, one extra
  // request each, since it's the only state where the number is meaningful
  // and changing (pre-game and final are trivial to derive without it).
  const withProbability = await Promise.all(
    games.map(async (g) => {
      if (g.state !== "in") {
        return {
          ...g,
          homeWinPct: g.state === "post" ? (g.homeScore >= g.awayScore ? 100 : 0) : null,
          awayWinPct: g.state === "post" ? (g.awayScore >= g.homeScore ? 100 : 0) : null,
        };
      }
      const homeWinPct = await getWinProbability(g.espnEventId);
      return {
        ...g,
        homeWinPct,
        awayWinPct: homeWinPct === null ? null : 100 - homeWinPct,
      };
    }),
  );

  return withProbability;
}

/** NFL teams (Sleeper-style abbreviations) with at least one currently rostered player, for filtering the scoreboard down to games this league actually cares about. */
export function getRosteredNflTeams(leagueId: string, db: Database = getDb()): Set<string> {
  const rows = db.prepare(`SELECT players_json FROM rosters WHERE league_id = ?`).all(leagueId) as {
    players_json: string;
  }[];
  const ids = new Set<string>();
  for (const r of rows) {
    for (const pid of JSON.parse(r.players_json) as string[]) ids.add(pid);
  }
  ids.delete("0");
  if (ids.size === 0) return new Set();

  const idList = Array.from(ids);
  const placeholders = idList.map(() => "?").join(",");
  const rows2 = db
    .prepare(`SELECT DISTINCT team FROM players WHERE player_id IN (${placeholders}) AND team IS NOT NULL`)
    .all(...idList) as { team: string }[];
  return new Set(rows2.map((r) => r.team));
}
