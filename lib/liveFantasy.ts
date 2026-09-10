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
