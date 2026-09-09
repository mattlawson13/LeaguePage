import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";

export interface LeagueSummary {
  league_id: string;
  season: string;
  name: string;
  previous_league_id: string | null;
  settings: Record<string, number>;
  roster_positions: string[];
}

export interface RosterManager {
  rosterId: number;
  userId: string | null;
  displayName: string;
  teamName: string | null;
  avatar: string | null;
}

function rowToLeague(row: {
  league_id: string;
  season: string;
  name: string;
  previous_league_id: string | null;
  settings_json: string;
  roster_positions_json: string;
}): LeagueSummary {
  return {
    league_id: row.league_id,
    season: row.season,
    name: row.name,
    previous_league_id: row.previous_league_id,
    settings: JSON.parse(row.settings_json),
    roster_positions: JSON.parse(row.roster_positions_json),
  };
}

export function getNflState(db: Database = getDb()) {
  return db.prepare(`SELECT season, season_type, week, display_week FROM nfl_state WHERE id = 1`).get() as
    | { season: string; season_type: string; week: number; display_week: number }
    | undefined;
}

export function getSeasons(db: Database = getDb()): string[] {
  const rows = db.prepare(`SELECT DISTINCT season FROM leagues ORDER BY season DESC`).all() as { season: string }[];
  return rows.map((r) => r.season);
}

export function getLeagueForSeason(season: string, db: Database = getDb()): LeagueSummary | null {
  const row = db
    .prepare(
      `SELECT league_id, season, name, previous_league_id, settings_json, roster_positions_json FROM leagues WHERE season = ?`,
    )
    .get(season) as
    | {
        league_id: string;
        season: string;
        name: string;
        previous_league_id: string | null;
        settings_json: string;
        roster_positions_json: string;
      }
    | undefined;
  return row ? rowToLeague(row) : null;
}

export function getCurrentLeague(db: Database = getDb()): LeagueSummary | null {
  const state = getNflState(db);
  if (state) {
    const league = getLeagueForSeason(state.season, db);
    if (league) return league;
  }
  const seasons = getSeasons(db);
  return seasons.length > 0 ? getLeagueForSeason(seasons[0], db) : null;
}

export function getCurrentWeek(db: Database = getDb()): number {
  const state = getNflState(db);
  return state?.display_week || state?.week || 1;
}

export function getRosterManagers(leagueId: string, db: Database = getDb()): Map<number, RosterManager> {
  const rows = db
    .prepare(
      `SELECT r.roster_id as roster_id, r.owner_id as owner_id, lu.display_name as display_name, lu.team_name as team_name, lu.avatar as avatar
       FROM rosters r
       LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as {
    roster_id: number;
    owner_id: string | null;
    display_name: string | null;
    team_name: string | null;
    avatar: string | null;
  }[];

  const map = new Map<number, RosterManager>();
  for (const r of rows) {
    map.set(r.roster_id, {
      rosterId: r.roster_id,
      userId: r.owner_id,
      displayName: r.team_name || r.display_name || `Roster ${r.roster_id}`,
      teamName: r.team_name,
      avatar: r.avatar,
    });
  }
  return map;
}
