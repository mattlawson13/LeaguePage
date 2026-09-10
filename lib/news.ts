import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentLeague } from "./league";

export interface RosteredPlayerName {
  playerId: string;
  fullName: string;
}

/** Every player on a current-season roster, for fuzzy-matching against article text. */
export function getCurrentlyRosteredPlayerNames(db: Database = getDb()): RosteredPlayerName[] {
  const league = getCurrentLeague(db);
  if (!league) return [];

  const rows = db.prepare(`SELECT players_json FROM rosters WHERE league_id = ?`).all(league.league_id) as {
    players_json: string;
  }[];
  const ids = new Set<string>();
  for (const r of rows) {
    for (const pid of JSON.parse(r.players_json) as string[]) ids.add(pid);
  }
  ids.delete("0");
  if (ids.size === 0) return [];

  const idList = Array.from(ids);
  const placeholders = idList.map(() => "?").join(",");
  const players = db
    .prepare(`SELECT player_id, full_name FROM players WHERE player_id IN (${placeholders}) AND full_name IS NOT NULL`)
    .all(...idList) as { player_id: string; full_name: string }[];

  return players.map((p) => ({ playerId: p.player_id, fullName: p.full_name }));
}

export interface NewsArticle {
  link: string;
  source: string;
  title: string;
  summary: string | null;
  pubDate: string | null;
  players: { playerId: string; name: string; managerName: string | null }[];
}

export function getNewsFeed(limit = 60, db: Database = getDb()): NewsArticle[] {
  const articles = db
    .prepare(`SELECT link, source, title, summary, pub_date FROM news_articles ORDER BY pub_date DESC LIMIT ?`)
    .all(limit) as { link: string; source: string; title: string; summary: string | null; pub_date: string | null }[];
  if (articles.length === 0) return [];

  const league = getCurrentLeague(db);
  const managerByPlayer = new Map<string, string>();
  if (league) {
    const rows = db
      .prepare(
        `SELECT r.players_json as players_json, COALESCE(lu.display_name, r.owner_id, 'Roster ' || r.roster_id) as display_name
         FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
         WHERE r.league_id = ?`,
      )
      .all(league.league_id) as { players_json: string; display_name: string }[];
    for (const r of rows) {
      for (const pid of JSON.parse(r.players_json) as string[]) managerByPlayer.set(pid, r.display_name);
    }
  }

  const links = articles.map((a) => a.link);
  const placeholders = links.map(() => "?").join(",");
  const playerLinks = db
    .prepare(
      `SELECT nap.link as link, nap.player_id as player_id, p.full_name as full_name
       FROM news_article_players nap LEFT JOIN players p ON p.player_id = nap.player_id
       WHERE nap.link IN (${placeholders})`,
    )
    .all(...links) as { link: string; player_id: string; full_name: string | null }[];

  const playersByLink = new Map<string, NewsArticle["players"]>();
  for (const pl of playerLinks) {
    if (!playersByLink.has(pl.link)) playersByLink.set(pl.link, []);
    playersByLink.get(pl.link)!.push({
      playerId: pl.player_id,
      name: pl.full_name ?? pl.player_id,
      managerName: managerByPlayer.get(pl.player_id) ?? null,
    });
  }

  return articles.map((a) => ({
    link: a.link,
    source: a.source,
    title: a.title,
    summary: a.summary,
    pubDate: a.pub_date,
    players: playersByLink.get(a.link) ?? [],
  }));
}

export interface TrendingPlayer {
  type: "add" | "drop";
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  count: number;
  managerName: string | null;
}

/** Sleeper's trending adds/drops, from the most recent ingest snapshot only. Attribution required by Sleeper when displayed. */
export function getTrendingPlayers(db: Database = getDb()): TrendingPlayer[] {
  const latest = db.prepare(`SELECT MAX(fetched_at) as fetched_at FROM trending`).get() as { fetched_at: string | null };
  if (!latest.fetched_at) return [];

  const rows = db
    .prepare(
      `SELECT t.type as type, t.player_id as player_id, t.count as count, p.full_name as full_name, p.position as position, p.team as team
       FROM trending t LEFT JOIN players p ON p.player_id = t.player_id
       WHERE t.fetched_at = ?
       ORDER BY t.type, t.count DESC`,
    )
    .all(latest.fetched_at) as {
    type: "add" | "drop";
    player_id: string;
    count: number;
    full_name: string | null;
    position: string | null;
    team: string | null;
  }[];

  const league = getCurrentLeague(db);
  const managerByPlayer = new Map<string, string>();
  if (league) {
    const rosterRows = db
      .prepare(
        `SELECT r.players_json as players_json, COALESCE(lu.display_name, r.owner_id, 'Roster ' || r.roster_id) as display_name
         FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
         WHERE r.league_id = ?`,
      )
      .all(league.league_id) as { players_json: string; display_name: string }[];
    for (const r of rosterRows) {
      for (const pid of JSON.parse(r.players_json) as string[]) managerByPlayer.set(pid, r.display_name);
    }
  }

  return rows.map((r) => ({
    type: r.type,
    playerId: r.player_id,
    name: r.full_name ?? r.player_id,
    position: r.position,
    team: r.team,
    count: r.count,
    managerName: managerByPlayer.get(r.player_id) ?? null,
  }));
}
