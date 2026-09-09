import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";

interface TransactionRow {
  transaction_id: string;
  league_id: string;
  season: string;
  week: number | null;
  type: string;
  status: string;
  created: number;
  roster_ids_json: string;
  adds_json: string;
  drops_json: string;
  draft_picks_json: string;
  waiver_budget_json: string;
}

export interface TransactionPlayerMove {
  playerId: string;
  playerName: string;
  rosterId: number;
  managerName: string;
}

export interface TransactionPickMove {
  season: string;
  round: number;
  fromManagerName: string;
  toManagerName: string;
}

export interface TransactionFeedItem {
  transactionId: string;
  leagueId: string;
  season: string;
  week: number | null;
  type: string;
  status: string;
  created: number;
  adds: TransactionPlayerMove[];
  drops: TransactionPlayerMove[];
  picks: TransactionPickMove[];
  faabBids: { rosterId: number; managerName: string; amount: number }[];
  rosterIds: number[];
}

export interface TransactionFilters {
  season?: string;
  type?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export function getTransactionsFeed(filters: TransactionFilters, db: Database = getDb()): TransactionFeedItem[] {
  let query = `SELECT * FROM transactions WHERE status = 'complete'`;
  const params: (string | number)[] = [];
  if (filters.season) {
    query += ` AND season = ?`;
    params.push(filters.season);
  }
  if (filters.type) {
    query += ` AND type = ?`;
    params.push(filters.type);
  }
  query += ` ORDER BY created DESC`;
  // Pagination is applied after the userId filter below (roster_id isn't
  // globally unique, so that filter can't be pushed into SQL), so limit/
  // offset are handled in JS instead of here.

  const rows = db.prepare(query).all(...params) as TransactionRow[];

  // Resolve roster_id -> manager display name per season/league, and
  // player_id -> full_name, lazily and cached across this call.
  const managerCache = new Map<string, Map<number, string>>();
  const getManagerName = (leagueId: string, rosterId: number): string => {
    if (!managerCache.has(leagueId)) {
      const rosterRows = db
        .prepare(
          `SELECT r.roster_id as roster_id, COALESCE(lu.team_name, lu.display_name, 'Roster ' || r.roster_id) as name
           FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
           WHERE r.league_id = ?`,
        )
        .all(leagueId) as { roster_id: number; name: string }[];
      managerCache.set(leagueId, new Map(rosterRows.map((r) => [r.roster_id, r.name])));
    }
    return managerCache.get(leagueId)!.get(rosterId) ?? `Roster ${rosterId}`;
  };

  const playerNameCache = new Map<string, string>();
  const getPlayerName = (playerId: string): string => {
    if (playerNameCache.has(playerId)) return playerNameCache.get(playerId)!;
    const row = db.prepare(`SELECT full_name FROM players WHERE player_id = ?`).get(playerId) as
      | { full_name: string | null }
      | undefined;
    const name = row?.full_name ?? playerId;
    playerNameCache.set(playerId, name);
    return name;
  };

  const items: TransactionFeedItem[] = rows.map((r) => {
    const adds = JSON.parse(r.adds_json) as Record<string, number> | null;
    const drops = JSON.parse(r.drops_json) as Record<string, number> | null;
    const draftPicks = JSON.parse(r.draft_picks_json) as {
      season: string;
      round: number;
      roster_id: number;
      owner_id: number;
      previous_owner_id: number;
    }[];
    const waiverBudget = JSON.parse(r.waiver_budget_json) as { sender: number; receiver: number; amount: number }[];
    const rosterIds = JSON.parse(r.roster_ids_json) as number[];

    const toMoves = (map: Record<string, number> | null): TransactionPlayerMove[] =>
      map
        ? Object.entries(map).map(([playerId, rosterId]) => ({
            playerId,
            playerName: getPlayerName(playerId),
            rosterId,
            managerName: getManagerName(r.league_id, rosterId),
          }))
        : [];

    return {
      transactionId: r.transaction_id,
      leagueId: r.league_id,
      season: r.season,
      week: r.week,
      type: r.type,
      status: r.status,
      created: r.created,
      adds: toMoves(adds),
      drops: toMoves(drops),
      picks: draftPicks.map((p) => ({
        season: p.season,
        round: p.round,
        fromManagerName: getManagerName(r.league_id, p.previous_owner_id),
        toManagerName: getManagerName(r.league_id, p.owner_id),
      })),
      faabBids: waiverBudget.map((w) => ({
        rosterId: w.receiver,
        managerName: getManagerName(r.league_id, w.receiver),
        amount: w.amount,
      })),
      rosterIds,
    };
  });

  let filtered = items;
  if (filters.userId) {
    const userRosterKeys = new Set<string>();
    const rosterRows = db.prepare(`SELECT league_id, roster_id FROM rosters WHERE owner_id = ?`).all(filters.userId) as {
      league_id: string;
      roster_id: number;
    }[];
    for (const rr of rosterRows) userRosterKeys.add(`${rr.league_id}:${rr.roster_id}`);
    filtered = items.filter((item) => item.rosterIds.some((id) => userRosterKeys.has(`${item.leagueId}:${id}`)));
  }

  if (filters.limit) {
    const offset = filters.offset ?? 0;
    return filtered.slice(offset, offset + filters.limit);
  }
  return filtered;
}
