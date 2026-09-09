// Thin client for the Sleeper API (https://docs.sleeper.com). Read-only,
// unauthenticated, non-commercial use only. Stay well under Sleeper's
// documented ~1000 req/min by spacing calls in the ingest script rather than
// batching them here.

const BASE_URL = "https://api.sleeper.app";

async function getJson<T>(pathname: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Sleeper API ${pathname} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface NflState {
  week: number;
  leg: number;
  season: string;
  season_type: string;
  league_season: string;
  previous_season: string;
  display_week: number;
  league_create_season: string;
}

export interface League {
  league_id: string;
  name: string;
  season: string;
  season_type: string;
  status: string;
  sport: string;
  avatar: string | null;
  previous_league_id: string | null;
  draft_id: string | null;
  total_rosters: number;
  roster_positions: string[];
  settings: Record<string, number>;
  scoring_settings: Record<string, number>;
  metadata: Record<string, unknown> | null;
}

export interface LeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner: boolean | null;
  metadata: { team_name?: string } & Record<string, unknown>;
}

export interface Roster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  league_id: string;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
    waiver_position?: number;
    waiver_budget_used?: number;
  };
}

export interface Matchup {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  custom_points: number | null;
  players: string[] | null;
  starters: string[] | null;
  players_points: Record<string, number> | null;
}

export interface Transaction {
  transaction_id: string;
  type: string;
  status: string;
  creator: string | null;
  created: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: unknown[];
  waiver_budget: { sender: number; receiver: number; amount: number }[];
}

export interface BracketMatch {
  r: number;
  m: number;
  t1: number | number[] | null;
  t2: number | number[] | null;
  w: number | null;
  l: number | null;
  t1_from?: Record<string, number>;
  t2_from?: Record<string, number>;
}

export interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface Draft {
  draft_id: string;
  league_id: string;
  season: string;
  status: string;
  type: string;
  start_time: number | null;
  settings: Record<string, number>;
  draft_order: Record<string, number> | null;
  slot_to_roster_id: Record<string, number> | null;
}

export interface DraftPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  player_id: string;
  picked_by: string;
  is_keeper: boolean | null;
  metadata: Record<string, unknown>;
}

export interface SleeperPlayer {
  player_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  search_full_name: string | null;
  position: string | null;
  team: string | null;
  status: string | null;
  injury_status: string | null;
  active: boolean | null;
  [key: string]: unknown;
}

export type TrendingType = "add" | "drop";

export interface TrendingPlayer {
  player_id: string;
  count: number;
}

export const sleeper = {
  getNflState: () => getJson<NflState>("/v1/state/nfl"),
  getLeague: (leagueId: string) => getJson<League>(`/v1/league/${leagueId}`),
  getLeagueUsers: (leagueId: string) =>
    getJson<LeagueUser[]>(`/v1/league/${leagueId}/users`),
  getRosters: (leagueId: string) =>
    getJson<Roster[]>(`/v1/league/${leagueId}/rosters`),
  getMatchups: (leagueId: string, week: number) =>
    getJson<Matchup[]>(`/v1/league/${leagueId}/matchups/${week}`),
  getTransactions: (leagueId: string, week: number) =>
    getJson<Transaction[]>(`/v1/league/${leagueId}/transactions/${week}`),
  getWinnersBracket: (leagueId: string) =>
    getJson<BracketMatch[]>(`/v1/league/${leagueId}/winners_bracket`),
  getLosersBracket: (leagueId: string) =>
    getJson<BracketMatch[]>(`/v1/league/${leagueId}/losers_bracket`),
  getTradedPicks: (leagueId: string) =>
    getJson<TradedPick[]>(`/v1/league/${leagueId}/traded_picks`),
  getDrafts: (leagueId: string) =>
    getJson<Draft[]>(`/v1/league/${leagueId}/drafts`),
  getDraftPicks: (draftId: string) =>
    getJson<DraftPick[]>(`/v1/draft/${draftId}/picks`),
  getAllPlayers: () => getJson<Record<string, SleeperPlayer>>("/v1/players/nfl"),
  getTrending: (type: TrendingType, limit = 25) =>
    getJson<TrendingPlayer[]>(
      `/v1/players/nfl/trending/${type}?limit=${limit}`,
    ),
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
