import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";

interface MatchupRow {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  custom_points: number | null;
  players_json: string;
  starters_json: string;
  players_points_json: string;
}

export interface MatchupPlayer {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  points: number;
}

export interface MatchupTeam {
  rosterId: number;
  userId: string | null;
  managerName: string;
  avatar: string | null;
  points: number;
  starters: MatchupPlayer[];
  bench: MatchupPlayer[];
}

export interface WeekMatchup {
  matchupId: number;
  teams: MatchupTeam[];
}

export function getWeekMatchups(leagueId: string, week: number, db: Database = getDb()): WeekMatchup[] {
  const rows = db
    .prepare(`SELECT * FROM matchups WHERE league_id = ? AND week = ? AND matchup_id IS NOT NULL`)
    .all(leagueId, week) as MatchupRow[];

  const rosterInfo = db
    .prepare(
      `SELECT r.roster_id as roster_id, r.owner_id as owner_id, COALESCE(lu.team_name, lu.display_name, 'Roster ' || r.roster_id) as name, lu.avatar as avatar
       FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as { roster_id: number; owner_id: string | null; name: string; avatar: string | null }[];
  const rosterById = new Map(rosterInfo.map((r) => [r.roster_id, r]));

  const allPlayerIds = new Set<string>();
  for (const row of rows) {
    for (const pid of JSON.parse(row.players_json) as string[]) allPlayerIds.add(pid);
  }
  const playerById = new Map<string, { full_name: string | null; position: string | null; team: string | null }>();
  if (allPlayerIds.size > 0) {
    const placeholders = Array.from(allPlayerIds).map(() => "?").join(",");
    const playerRows = db
      .prepare(`SELECT player_id, full_name, position, team FROM players WHERE player_id IN (${placeholders})`)
      .all(...Array.from(allPlayerIds)) as {
      player_id: string;
      full_name: string | null;
      position: string | null;
      team: string | null;
    }[];
    for (const p of playerRows) playerById.set(p.player_id, p);
  }

  const grouped = new Map<number, MatchupRow[]>();
  for (const row of rows) {
    const key = row.matchup_id!;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const result: WeekMatchup[] = [];
  for (const [matchupId, teamRows] of grouped) {
    const teams: MatchupTeam[] = teamRows.map((row) => {
      const info = rosterById.get(row.roster_id);
      const playersPoints = JSON.parse(row.players_points_json) as Record<string, number>;
      const starterIds = JSON.parse(row.starters_json) as string[];
      const allIds = JSON.parse(row.players_json) as string[];
      const benchIds = allIds.filter((id) => !starterIds.includes(id));

      const toPlayer = (playerId: string): MatchupPlayer => {
        const p = playerById.get(playerId);
        return {
          playerId,
          name: p?.full_name ?? (playerId === "0" ? "Empty" : playerId),
          position: p?.position ?? "—",
          team: p?.team ?? null,
          points: playersPoints[playerId] ?? 0,
        };
      };

      return {
        rosterId: row.roster_id,
        userId: info?.owner_id ?? null,
        managerName: info?.name ?? `Roster ${row.roster_id}`,
        avatar: info?.avatar ?? null,
        points: row.custom_points ?? row.points ?? 0,
        starters: starterIds.map(toPlayer),
        bench: benchIds.map(toPlayer),
      };
    });
    result.push({ matchupId, teams });
  }

  return result.sort((a, b) => a.matchupId - b.matchupId);
}
