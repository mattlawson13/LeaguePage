# Fantasy Football League Site — Build Spec

**League ID:** `1316847782803296256`
**API:** Sleeper (https://docs.sleeper.com) — read-only, no auth, non-commercial use only. Stay under ~1000 req/min.

---

## Stack

- **Next.js (App Router) + TypeScript + Tailwind**
- **SQLite via better-sqlite3** (or Postgres if deploying to Vercel — use Neon/Supabase)
- **Recharts** for charts
- Deploy: Vercel. Cron via `vercel.json` crons or GitHub Actions.

Rationale: Sleeper data is immutable once a week is final. Ingest into a local DB, serve from the DB, never call Sleeper on page load. This is the single most important architectural decision — do not build this as a client-side app that hits Sleeper directly on every render.

---

## Phase 1 — Ingest layer (build this first, no UI)

Write `scripts/ingest.ts` with one function per endpoint. All responses cached to DB with a `fetched_at`.

| Data | Endpoint | Refresh |
|---|---|---|
| NFL state | `/v1/state/nfl` | hourly |
| League | `/v1/league/{id}` | daily |
| Users | `/v1/league/{id}/users` | daily |
| Rosters | `/v1/league/{id}/rosters` | hourly in-season |
| Matchups | `/v1/league/{id}/matchups/{week}` | every 5 min on gamedays, else daily |
| Transactions | `/v1/league/{id}/transactions/{week}` | hourly |
| Winners bracket | `/v1/league/{id}/winners_bracket` | daily |
| Losers bracket | `/v1/league/{id}/losers_bracket` | daily |
| Traded picks | `/v1/league/{id}/traded_picks` | daily |
| Drafts | `/v1/league/{id}/drafts` then `/v1/draft/{draft_id}/picks` | once per season |
| Player map | `/v1/players/nfl` | **once per day max** — ~5MB, cache to `data/players.json` |
| Trending | `/v1/players/nfl/trending/add?limit=25` | hourly |

### History backfill
Walk `previous_league_id` from the current league backwards until it's null. For each season pull league, users, rosters, matchups for all weeks, brackets, transactions, and draft. Store `season` on every row. Run this once, then it never changes.

**Important:** `roster_id` is only stable within a season. `user_id` is stable across seasons. Key all cross-season logic on `user_id`, with a `managers` table mapping user_id → canonical manager. Handle the case where someone leaves and a new person inherits a roster_id.

### Matchup shape
`/matchups/{week}` returns one object per team. Two teams sharing a `matchup_id` played each other. Bench = `players` minus `starters`. `points` is the team total; `custom_points` overrides if the commish edited it.

---

## Phase 2 — Derived stats engine

`lib/stats.ts`. Everything below is computed from ingested data, not fetched.

- Per-manager all-time: W-L-T, PF, PA, avg PF, best/worst week, playoff appearances, titles, last-place finishes
- Head-to-head matrix (every manager pair, all-time)
- Luck metrics: **all-play record** (each week, your score vs every other team that week) and expected wins. The gap between all-play win% and actual win% is your luck number — this powers most of the superlatives.
- Points left on bench per week (optimal lineup vs actual, respecting `roster_positions` from the league object)
- Weekly scoring distribution per manager (mean, stdev) — feeds the odds model
- Draft pick value: pick number vs season points scored → biggest steals and busts

---

## Phase 3 — Pages

### 1. Manager bios
One page per manager. Top half is editorial (from `data/managers.json`, hand-written): photo, bio, championship count, catchphrase, "known for". Bottom half is generated: all-time record, title history, best/worst seasons, draft tendencies (avg position taken by round), transaction volume, current roster.

### 2. Rivalries
`data/rivalries.json` names the marquee ones with hand-written context. Auto-generate the rest. Each rivalry page: H2H record, avg margin, closest game, biggest blowout, playoff meetings, combined trade history between the two, a scoring-history line chart. Auto-detect a "rivalry score" = games played × closeness of record × avg point differential (inverse), and surface the top 5.

### 3. Matchup overview
Current week's matchups as cards. Each: both lineups side by side, projected total, live points if in progress, win probability from the odds model, H2H snippet, and a one-line auto-generated storyline. Week selector to view any past week of any season.

### 4. Betting odds
**No sportsbook prices fantasy matchups. You are the book.** Model:

1. Per-team weekly score distribution: fit mean + stdev from that team's scores this season, shrunk toward league mean (small sample — use a Bayesian shrinkage, weight ~ n/(n+4)).
2. Adjust for current-week injuries/byes using the player map's `injury_status` and starter slots.
3. Monte Carlo 10,000 sims of TeamA − TeamB.
4. Win prob → moneyline. Spread = median margin, rounded to 0.5. Total = median combined.
5. Add a configurable vig (~4.5%) so the two-way prices look real.

Show: moneyline, spread, O/U per matchup, plus season-long futures (title odds, most PF, last place). Add a play-money bet tracker with a leaderboard so the league can actually use it. Store closing lines so you can grade everyone at season end.

### 5. League history
Season-by-season archive: final standings, champion, bracket, draft board, notable trades. A "hall of fame" timeline. All-time leaderboards (single-week high score, single-season PF, longest win streak, etc.). Championship banner wall.

### 6. Player history
Every player who's ever been on a league roster: who drafted them, who rostered them and when, points scored for each manager, trade history. Search + filter. Fun angle: "most-traded player in league history", "the player that keeps ruining Dave's season".

### 7. Trophy room
Championship trophies, and joke trophies you define in `data/awards.json`: last place (toilet bowl), highest PF without a title, most points left on bench in a season, worst trade of the year. Render as a case with hover detail cards. Auto-award what's computable, allow manual overrides for commish-voted awards.

### 8. Superlatives
Auto-generated weekly and seasonal. Weekly: Team of the Week, biggest blowout, closest call, unluckiest (high score in a loss), biggest bench regret, worst start/sit call. Seasonal: luckiest/unluckiest, most active in trades, waiver wire king (FAAB spent vs points gained), draft-day winner. Generate copy with a small template library so it reads like a column, not a table.

### 9. Playoff odds
Monte Carlo over remaining regular season. Simulate each remaining matchup with the same score-distribution model, apply the league's actual playoff settings (`playoff_teams`, `playoff_week_start` from the league `settings` object) and tiebreakers. Output per team: make-playoffs %, seed distribution, title %, last-place %. Chart the week-over-week movement — that graph is the best thing on the site.

### 10. Transactions
Feed of every add/drop/waiver/trade, newest first, filterable by manager, type, season. Resolve player IDs to names. Show FAAB bid amounts from `settings.waiver_bid`. Trade cards show both sides plus picks. Add a "trade grade" — points scored by each side after the trade date. Include a "biggest FAAB overpay" leaderboard.

### 11. News feed
No news endpoint exists in the Sleeper API. Do this instead:

- RSS ingest: ESPN NFL, Rotowire, PFF, CBS Fantasy, Underdog's blog. Parse with `rss-parser`, store, dedupe by URL.
- Filter to articles mentioning a player currently rostered in the league (fuzzy match on `search_full_name` from the player map), tag with the rostering manager.
- Surface Sleeper's trending adds/drops alongside it — that endpoint does exist, and Sleeper asks for attribution if you display it.
- **Skip X.** The API is paid and the free tier won't sustain this.

---

## Design direction

Dark, editorial, sports-broadcast feel. Not a dashboard.

- Deep charcoal base (`#0d0d0f`), one saturated accent for live/active states, muted gold for championship elements
- Big condensed type for numbers and scores (Archivo Condensed / Barlow Condensed); clean sans for body (Inter)
- Team avatars from `https://sleepercdn.com/avatars/thumbs/{avatar_id}`
- Cards over tables where possible; tables should be dense and monospaced for numerics
- Manager color assignment: one stable accent per manager, used consistently across every chart on the site
- Mobile first — this gets opened on phones during games

---

## Manual content files

- `data/managers.json` — bio, photo, joined year, nickname, hand-written flavor
- `data/rivalries.json` — named rivalries with origin stories
- `data/awards.json` — trophy definitions, manual overrides
- `data/eras.json` — optional, name the league's eras for the history page

---

## Build order

1. Ingest + DB schema + history backfill
2. Stats engine with tests on known values
3. Layout shell, nav, design system
4. Matchups → Standings → Transactions (the weekly-use pages)
5. Odds + playoff odds model
6. History, player history, trophy room
7. Superlatives generator
8. Manager bios + rivalries
9. News RSS
10. Cron jobs + deploy

Ship 1–4 before touching anything else.
