-- Sleeper league data warehouse. All rows carry `season` where relevant since
-- roster_id is only stable within a season; cross-season identity lives on
-- user_id via the `managers` table.

CREATE TABLE IF NOT EXISTS nfl_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  season TEXT NOT NULL,
  season_type TEXT NOT NULL,
  week INTEGER NOT NULL,
  display_week INTEGER NOT NULL,
  league_create_season TEXT,
  previous_season TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS managers (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar TEXT,
  first_season TEXT,
  last_season TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leagues (
  league_id TEXT PRIMARY KEY,
  season TEXT NOT NULL,
  previous_league_id TEXT,
  name TEXT,
  status TEXT,
  avatar TEXT,
  settings_json TEXT NOT NULL,
  scoring_settings_json TEXT NOT NULL,
  roster_positions_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leagues_season ON leagues(season);

CREATE TABLE IF NOT EXISTS league_users (
  league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  team_name TEXT,
  avatar TEXT,
  is_owner INTEGER DEFAULT 0,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (league_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_league_users_user ON league_users(user_id);

CREATE TABLE IF NOT EXISTS rosters (
  league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  roster_id INTEGER NOT NULL,
  owner_id TEXT,
  co_owners_json TEXT,
  players_json TEXT,
  starters_json TEXT,
  reserve_json TEXT,
  taxi_json TEXT,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  fpts REAL DEFAULT 0,
  fpts_decimal REAL DEFAULT 0,
  fpts_against REAL DEFAULT 0,
  fpts_against_decimal REAL DEFAULT 0,
  waiver_position INTEGER,
  waiver_budget_used INTEGER,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (league_id, roster_id)
);
CREATE INDEX IF NOT EXISTS idx_rosters_owner ON rosters(owner_id);
CREATE INDEX IF NOT EXISTS idx_rosters_season ON rosters(season);

CREATE TABLE IF NOT EXISTS matchups (
  league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  roster_id INTEGER NOT NULL,
  matchup_id INTEGER,
  points REAL,
  custom_points REAL,
  players_json TEXT,
  starters_json TEXT,
  players_points_json TEXT,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (league_id, week, roster_id)
);
CREATE INDEX IF NOT EXISTS idx_matchups_season_week ON matchups(season, week);
CREATE INDEX IF NOT EXISTS idx_matchups_matchup_id ON matchups(league_id, week, matchup_id);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  week INTEGER,
  type TEXT,
  status TEXT,
  creator TEXT,
  created INTEGER,
  roster_ids_json TEXT,
  adds_json TEXT,
  drops_json TEXT,
  draft_picks_json TEXT,
  waiver_budget_json TEXT,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_season_week ON transactions(season, week);
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);

CREATE TABLE IF NOT EXISTS brackets (
  league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('winners', 'losers')),
  data_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (league_id, type)
);

CREATE TABLE IF NOT EXISTS traded_picks (
  league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  pick_season TEXT NOT NULL,
  round INTEGER NOT NULL,
  roster_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  previous_owner_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (league_id, pick_season, round, roster_id)
);

CREATE TABLE IF NOT EXISTS drafts (
  draft_id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT,
  type TEXT,
  start_time INTEGER,
  settings_json TEXT,
  draft_order_json TEXT,
  slot_to_roster_id_json TEXT,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_picks (
  draft_id TEXT NOT NULL,
  pick_no INTEGER NOT NULL,
  round INTEGER,
  draft_slot INTEGER,
  roster_id INTEGER,
  player_id TEXT,
  picked_by TEXT,
  is_keeper INTEGER DEFAULT 0,
  metadata_json TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (draft_id, pick_no)
);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON draft_picks(player_id);

CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  full_name TEXT,
  search_full_name TEXT,
  position TEXT,
  team TEXT,
  status TEXT,
  injury_status TEXT,
  active INTEGER,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_search ON players(search_full_name);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);

CREATE TABLE IF NOT EXISTS trending (
  type TEXT NOT NULL CHECK (type IN ('add', 'drop')),
  player_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (type, player_id, fetched_at)
);

CREATE TABLE IF NOT EXISTS ingest_meta (
  key TEXT PRIMARY KEY,
  last_fetched_at TEXT NOT NULL
);
