import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentLeague } from "./league";

export interface PlayerHistoryRow {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  careerPoints: number;
  timesDrafted: number;
  timesTraded: number;
  currentManager: string | null;
  seasons: string[];
}

/**
 * Every player who's ever touched this league — drafted, added off waivers,
 * or traded. Built from draft_picks + transactions (the union of those two
 * covers every way a player can enter a roster) rather than scanning every
 * matchup row for players_json, which would be far more parsing for the
 * same set of ids.
 */
export function getPlayerHistory(db: Database = getDb()): PlayerHistoryRow[] {
  const matchupRows = db
    .prepare(`SELECT season, players_points_json FROM matchups WHERE matchup_id IS NOT NULL`)
    .all() as { season: string; players_points_json: string }[];

  const pointsByPlayer = new Map<string, number>();
  const seasonsByPlayer = new Map<string, Set<string>>();
  const touch = (pid: string, season: string) => {
    if (!seasonsByPlayer.has(pid)) seasonsByPlayer.set(pid, new Set());
    seasonsByPlayer.get(pid)!.add(season);
  };

  for (const row of matchupRows) {
    const pp = JSON.parse(row.players_points_json) as Record<string, number>;
    for (const [pid, pts] of Object.entries(pp)) {
      if (pts === 0) continue;
      pointsByPlayer.set(pid, (pointsByPlayer.get(pid) ?? 0) + pts);
      touch(pid, row.season);
    }
  }

  const draftRows = db
    .prepare(`SELECT dp.player_id as player_id, d.season as season FROM draft_picks dp JOIN drafts d ON d.draft_id = dp.draft_id`)
    .all() as { player_id: string; season: string }[];
  const draftCountByPlayer = new Map<string, number>();
  for (const r of draftRows) {
    draftCountByPlayer.set(r.player_id, (draftCountByPlayer.get(r.player_id) ?? 0) + 1);
    touch(r.player_id, r.season);
  }

  const transactionRows = db
    .prepare(`SELECT season, type, adds_json, drops_json FROM transactions WHERE status = 'complete'`)
    .all() as { season: string; type: string; adds_json: string; drops_json: string }[];
  const tradeCountByPlayer = new Map<string, number>();
  for (const r of transactionRows) {
    const adds = JSON.parse(r.adds_json) as Record<string, number> | null;
    const drops = JSON.parse(r.drops_json) as Record<string, number> | null;
    const ids = new Set<string>([...Object.keys(adds ?? {}), ...Object.keys(drops ?? {})]);
    for (const pid of ids) {
      touch(pid, r.season);
      if (r.type === "trade") tradeCountByPlayer.set(pid, (tradeCountByPlayer.get(pid) ?? 0) + 1);
    }
  }

  const currentLeague = getCurrentLeague(db);
  const currentManagerByPlayer = new Map<string, string>();
  if (currentLeague) {
    const rosterRows = db
      .prepare(
        `SELECT r.players_json as players_json, COALESCE(lu.display_name, r.owner_id, 'Roster ' || r.roster_id) as display_name
         FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
         WHERE r.league_id = ?`,
      )
      .all(currentLeague.league_id) as { players_json: string; display_name: string }[];
    for (const r of rosterRows) {
      const ids = JSON.parse(r.players_json) as string[];
      for (const pid of ids) currentManagerByPlayer.set(pid, r.display_name);
    }
  }

  const allIds = new Set<string>([...pointsByPlayer.keys(), ...draftCountByPlayer.keys(), ...tradeCountByPlayer.keys()]);
  allIds.delete("0");

  const idList = Array.from(allIds);
  const infoById = new Map<string, { full_name: string | null; position: string | null; team: string | null }>();
  const CHUNK = 500;
  for (let i = 0; i < idList.length; i += CHUNK) {
    const chunk = idList.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT player_id, full_name, position, team FROM players WHERE player_id IN (${placeholders})`)
      .all(...chunk) as { player_id: string; full_name: string | null; position: string | null; team: string | null }[];
    for (const r of rows) infoById.set(r.player_id, r);
  }

  return idList
    .map((pid) => {
      const info = infoById.get(pid);
      return {
        playerId: pid,
        name: info?.full_name ?? pid,
        position: info?.position ?? "—",
        team: info?.team ?? null,
        careerPoints: pointsByPlayer.get(pid) ?? 0,
        timesDrafted: draftCountByPlayer.get(pid) ?? 0,
        timesTraded: tradeCountByPlayer.get(pid) ?? 0,
        currentManager: currentManagerByPlayer.get(pid) ?? null,
        seasons: Array.from(seasonsByPlayer.get(pid) ?? []).sort(),
      };
    })
    .sort((a, b) => b.careerPoints - a.careerPoints);
}
