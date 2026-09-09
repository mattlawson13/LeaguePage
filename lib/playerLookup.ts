import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";

export interface PlayerMatch {
  playerId: string;
  fullName: string;
  team: string | null;
  portraitUrl: string;
}

/** Mirrors Sleeper's own search_full_name normalization: lowercase, strip
 * punctuation/spaces and common name suffixes so "T.J. Watt" -> "tjwatt". */
function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, "");
}

/**
 * Resolves a hand-typed favorite_player name (e.g. "T.J. Watt") to a Sleeper
 * player_id via the cached player map. Ambiguous matches (retired players who
 * share a normalized name with an active one, like the two "Josh Allen"s)
 * are broken by preferring a non-null team, then the lower search_rank.
 * Returns null on no match — callers must render nothing, not a placeholder.
 */
export function findPlayerByName(name: string, db: Database = getDb()): PlayerMatch | null {
  const normalized = normalizePlayerName(name);
  const rows = db
    .prepare(`SELECT player_id, full_name, team, raw_json FROM players WHERE search_full_name = ?`)
    .all(normalized) as { player_id: string; full_name: string | null; team: string | null; raw_json: string }[];

  if (rows.length === 0) return null;

  const ranked = rows
    .map((r) => {
      const raw = JSON.parse(r.raw_json) as { search_rank?: number | null };
      return { ...r, searchRank: raw.search_rank ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((a, b) => {
      const aHasTeam = a.team ? 0 : 1;
      const bHasTeam = b.team ? 0 : 1;
      if (aHasTeam !== bHasTeam) return aHasTeam - bHasTeam;
      return a.searchRank - b.searchRank;
    });

  const best = ranked[0];
  return {
    playerId: best.player_id,
    fullName: best.full_name ?? name,
    team: best.team,
    portraitUrl: `https://sleepercdn.com/content/nfl/players/${best.player_id}.jpg`,
  };
}

export function teamLogoUrl(abbr: string): string {
  return `https://sleepercdn.com/images/team_logos/nfl/${abbr.toLowerCase()}.png`;
}
