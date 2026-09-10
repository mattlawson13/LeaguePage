import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getLeagues, getAllPlayByWeek, type LeagueRow } from "./stats";
import { getSeasonFinishes } from "./managers";

export interface SeasonStandingRow {
  finish: number;
  userId: string;
  displayName: string;
  record: string;
  pf: number;
  pa: number;
}

export interface SeasonArchiveEntry {
  season: string;
  leagueId: string;
  name: string;
  standings: SeasonStandingRow[];
}

function getRosterDisplayNames(db: Database, leagueId: string): Map<number, { userId: string; displayName: string }> {
  const rows = db
    .prepare(
      `SELECT r.roster_id as roster_id, r.owner_id as owner_id, lu.display_name as display_name
       FROM rosters r LEFT JOIN league_users lu ON lu.league_id = r.league_id AND lu.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as { roster_id: number; owner_id: string | null; display_name: string | null }[];
  const map = new Map<number, { userId: string; displayName: string }>();
  for (const r of rows) {
    if (!r.owner_id) continue;
    map.set(r.roster_id, { userId: r.owner_id, displayName: r.display_name ?? r.owner_id });
  }
  return map;
}

export function getSeasonArchive(db: Database = getDb()): SeasonArchiveEntry[] {
  const leagues = getLeagues(db)
    .filter((l: LeagueRow) => l.status === "complete")
    .sort((a, b) => b.season.localeCompare(a.season));

  return leagues.map((league) => {
    const owners = getRosterDisplayNames(db, league.league_id);
    const { finishes } = getSeasonFinishes(league.league_id, db);
    const rosters = db
      .prepare(`SELECT roster_id, wins, losses, ties, fpts, fpts_decimal, fpts_against, fpts_against_decimal FROM rosters WHERE league_id = ?`)
      .all(league.league_id) as {
      roster_id: number;
      wins: number;
      losses: number;
      ties: number;
      fpts: number;
      fpts_decimal: number;
      fpts_against: number;
      fpts_against_decimal: number;
    }[];

    const standings: SeasonStandingRow[] = rosters
      .map((r) => {
        const owner = owners.get(r.roster_id);
        return {
          finish: finishes.get(r.roster_id) ?? 99,
          userId: owner?.userId ?? "",
          displayName: owner?.displayName ?? `Roster ${r.roster_id}`,
          record: r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`,
          pf: r.fpts + r.fpts_decimal / 100,
          pa: r.fpts_against + r.fpts_against_decimal / 100,
        };
      })
      .sort((a, b) => a.finish - b.finish);

    return { season: league.season, leagueId: league.league_id, name: league.name, standings };
  });
}

export interface HighestWeekRecord {
  season: string;
  week: number;
  userId: string;
  displayName: string;
  points: number;
}

export function getHighestSingleWeek(db: Database = getDb()): HighestWeekRecord | null {
  const completeSeasons = getLeagues(db)
    .filter((l) => l.status === "complete")
    .map((l) => l.season);
  if (completeSeasons.length === 0) return null;
  const placeholders = completeSeasons.map(() => "?").join(",");

  const row = db
    .prepare(
      `SELECT m.season as season, m.week as week, m.league_id as league_id, m.roster_id as roster_id,
              COALESCE(m.custom_points, m.points) as points
       FROM matchups m
       WHERE m.matchup_id IS NOT NULL AND m.season IN (${placeholders})
       ORDER BY points DESC LIMIT 1`,
    )
    .get(...completeSeasons) as
    | { season: string; week: number; league_id: string; roster_id: number; points: number }
    | undefined;
  if (!row) return null;

  const owner = getRosterDisplayNames(db, row.league_id).get(row.roster_id);
  return {
    season: row.season,
    week: row.week,
    userId: owner?.userId ?? "",
    displayName: owner?.displayName ?? `Roster ${row.roster_id}`,
    points: row.points,
  };
}

export interface HighestSeasonPfRecord {
  season: string;
  userId: string;
  displayName: string;
  pf: number;
}

export function getHighestSingleSeasonPf(db: Database = getDb()): HighestSeasonPfRecord | null {
  const leagues = getLeagues(db).filter((l) => l.status === "complete");
  let best: HighestSeasonPfRecord | null = null;
  for (const league of leagues) {
    const owners = getRosterDisplayNames(db, league.league_id);
    const rosters = db
      .prepare(`SELECT roster_id, fpts, fpts_decimal FROM rosters WHERE league_id = ?`)
      .all(league.league_id) as { roster_id: number; fpts: number; fpts_decimal: number }[];
    for (const r of rosters) {
      const pf = r.fpts + r.fpts_decimal / 100;
      if (!best || pf > best.pf) {
        const owner = owners.get(r.roster_id);
        if (!owner) continue;
        best = { season: league.season, userId: owner.userId, displayName: owner.displayName, pf };
      }
    }
  }
  return best;
}

export interface WinStreakRecord {
  userId: string;
  displayName: string;
  length: number;
  startSeason: string;
  startWeek: number;
  endSeason: string;
  endWeek: number;
}

export function getLongestWinStreak(db: Database = getDb()): WinStreakRecord | null {
  const completeSeasons = new Set(getLeagues(db).filter((l) => l.status === "complete").map((l) => l.season));
  const managers = db.prepare(`SELECT user_id, display_name FROM managers`).all() as { user_id: string; display_name: string }[];
  const nameByUser = new Map(managers.map((m) => [m.user_id, m.display_name]));

  const rows = getAllPlayByWeek(db)
    .filter((r) => completeSeasons.has(r.season))
    .sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week);

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  let best: WinStreakRecord | null = null;
  for (const [userId, userRows] of byUser) {
    let curLen = 0;
    let curStart: { season: string; week: number } | null = null;
    for (const r of userRows) {
      if (r.actualWin === 1) {
        if (curLen === 0) curStart = { season: r.season, week: r.week };
        curLen++;
        if (!best || curLen > best.length) {
          best = {
            userId,
            displayName: nameByUser.get(userId) ?? userId,
            length: curLen,
            startSeason: curStart!.season,
            startWeek: curStart!.week,
            endSeason: r.season,
            endWeek: r.week,
          };
        }
      } else {
        curLen = 0;
        curStart = null;
      }
    }
  }
  return best;
}
