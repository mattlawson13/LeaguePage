import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getRosterManagers } from "./league";
import { sleeper, type Matchup } from "./sleeper";

/**
 * Live per-player fantasy points for one matchup, fetched directly from
 * Sleeper at request time (not the committed DB). Sleeper computes live
 * scoring during games, so this is genuinely real-time, unlike everything
 * else on the site which is only as fresh as the last ingest.
 */

export interface LiveMatchupPlayer {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  points: number;
}

export interface LiveMatchupTeam {
  rosterId: number;
  managerName: string;
  points: number;
  starters: LiveMatchupPlayer[];
}

export interface LiveMatchup {
  teamA: LiveMatchupTeam;
  teamB: LiveMatchupTeam;
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

export interface LiveGamePlayer {
  playerId: string;
  name: string;
  position: string;
  managerName: string | null;
  points: number;
}

/**
 * Every player in this league rostered by anyone (any manager, starter or
 * bench) who plays for one real NFL team, with live fantasy points. This is
 * scoped to an NFL game, not a fantasy matchup, so players on the same side
 * here can belong to entirely different fantasy managers (or none, if the
 * league has nobody rostering that player).
 */
export async function getLiveGamePlayers(
  leagueId: string,
  week: number,
  teamAbbr: string,
  db: Database = getDb(),
): Promise<LiveGamePlayer[]> {
  const liveMatchups = await sleeper.getMatchups(leagueId, week);
  const pointsByPlayer = new Map<string, number>();
  for (const m of liveMatchups) {
    if (!m.players_points) continue;
    for (const [pid, pts] of Object.entries(m.players_points)) pointsByPlayer.set(pid, pts);
  }

  const rosterRows = db
    .prepare(
      `SELECT r.players_json as players_json, COALESCE(lu.display_name, r.owner_id, 'Roster ' || r.roster_id) as manager_name
       FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as { players_json: string; manager_name: string }[];

  const managerByPlayer = new Map<string, string>();
  for (const r of rosterRows) {
    for (const pid of JSON.parse(r.players_json) as string[]) managerByPlayer.set(pid, r.manager_name);
  }

  const rosteredIds = Array.from(managerByPlayer.keys()).filter((id) => id !== "0");
  if (rosteredIds.length === 0) return [];

  const placeholders = rosteredIds.map(() => "?").join(",");
  const players = db
    .prepare(`SELECT player_id, full_name, position FROM players WHERE player_id IN (${placeholders}) AND team = ?`)
    .all(...rosteredIds, teamAbbr) as { player_id: string; full_name: string | null; position: string | null }[];

  return players
    .map((p) => ({
      playerId: p.player_id,
      name: p.full_name ?? p.player_id,
      position: p.position ?? "-",
      managerName: managerByPlayer.get(p.player_id) ?? null,
      points: pointsByPlayer.get(p.player_id) ?? 0,
    }))
    .sort((a, b) => {
      const posDiff = POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
      return posDiff !== 0 ? posDiff : b.points - a.points;
    });
}

export async function getLiveMatchup(
  leagueId: string,
  week: number,
  rosterIdA: number,
  rosterIdB: number,
  db: Database = getDb(),
): Promise<LiveMatchup | null> {
  const liveMatchups = await sleeper.getMatchups(leagueId, week);
  const byRoster = new Map(liveMatchups.map((m) => [m.roster_id, m]));
  const mA = byRoster.get(rosterIdA);
  const mB = byRoster.get(rosterIdB);
  if (!mA || !mB) return null;

  const allPlayerIds = new Set<string>([...(mA.starters ?? []), ...(mB.starters ?? [])]);
  allPlayerIds.delete("0");

  const playerById = new Map<string, { full_name: string | null; position: string | null; team: string | null }>();
  if (allPlayerIds.size > 0) {
    const idList = Array.from(allPlayerIds);
    const placeholders = idList.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT player_id, full_name, position, team FROM players WHERE player_id IN (${placeholders})`)
      .all(...idList) as { player_id: string; full_name: string | null; position: string | null; team: string | null }[];
    for (const r of rows) playerById.set(r.player_id, r);
  }

  const rosterManagers = getRosterManagers(leagueId, db);

  const toTeam = (m: Matchup, rosterId: number): LiveMatchupTeam => {
    const starters = (m.starters ?? []).map((pid) => {
      const p = playerById.get(pid);
      return {
        playerId: pid,
        name: p?.full_name ?? (pid === "0" ? "Empty" : pid),
        position: p?.position ?? "-",
        team: p?.team ?? null,
        points: m.players_points?.[pid] ?? 0,
      };
    });
    const manager = rosterManagers.get(rosterId);
    return {
      rosterId,
      managerName: manager?.displayName ?? `Roster ${rosterId}`,
      points: m.custom_points ?? m.points ?? 0,
      starters,
    };
  };

  return { teamA: toTeam(mA, rosterIdA), teamB: toTeam(mB, rosterIdB) };
}
