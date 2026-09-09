# Lawson Fantasy Football Gang

League hub for Sleeper league `1316847782803296256`. Full build spec in
[`league-site-spec.md`](./league-site-spec.md).

## Architecture

Sleeper data is immutable once a week is final, so this ingests into a local
SQLite database and serves every page from that DB — pages never call
Sleeper directly. See `scripts/ingest.ts` and `lib/db/schema.sql`.

**The database is a committed snapshot, not a live file.** Vercel's
serverless functions run on a read-only filesystem, so `.data/league.db` is
checked into the repo and opened read-only in production
(`lib/db/client.ts`). Locally, `getDb()` opens it read-write and applies the
schema automatically.

## Getting started

```bash
npm install
npm run ingest:full   # one-time history backfill — walks previous_league_id back to the first season
npm run dev
```

Open http://localhost:3000.

## Refreshing data

Sleeper doesn't get called on page load, so the site only reflects whatever
was last ingested. To pull fresh data:

```bash
npm run ingest          # current-season refresh (league, users, rosters, this week's matchups/transactions, trending)
npm run ingest:players  # force-refresh the ~5MB player map (otherwise capped to once/day)
npm run ingest:full     # full history re-backfill — only needed after adding a season
```

Each of these leaves `.data/league.db` as a single clean file ready to
commit. **After refreshing, commit `.data/league.db` and push** — that's
what redeploys the new data to Vercel; there's no live write path in
production.

## Manual content

`data/managers.json`, `data/rivalries.json`, `data/awards.json`, and
`data/eras.json` hold hand-written editorial content (bios, rivalries,
trophy definitions) — never generated stats. `data/managers.json`'s
`sleeper_username` field must exactly match a manager's current Sleeper
display name (case-insensitive, trimmed); `lib/managers.ts`'s
`resolveManagers()` fails loudly, listing every mismatch, if it doesn't.

## Deploying

Push to the tracked branch — Vercel builds and serves straight from the
committed `.data/league.db`. There is no database provisioning step.
