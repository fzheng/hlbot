# hlbot

![Coverage](badges/coverage.svg) [![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-brightgreen.svg?style=flat-square)](https://polyformproject.org/licenses/noncommercial/1.0.0/)

Single‑tenant Hyperliquid BTC perp tracker with real‑time fills & positions, time‑based pagination, and a minimal responsive UI.

> NOTE: The legacy recommendation & poller system has been removed. Trade pagination now uses a timestamp+id cursor (`beforeAt` + `beforeId`) for strict chronological ordering.

## Quick Start

1. Prereqs: Node.js 18+, npm (or pnpm).
2. Install: `npm install`
3. Dev (in‑memory storage): `npm run dev` → http://localhost:3000

### With Postgres (recommended)
```bash
docker compose up -d db
export STORAGE_BACKEND=postgres
export DATABASE_URL=postgresql://hlbot:hlbotpassword@localhost:5432/hlbot
npm run migrate
npm run dev
```

### Production (bare metal)
```bash
npm run build
STORAGE_BACKEND=postgres DATABASE_URL=postgresql://... npm run migrate
PORT=3000 node dist/server.js
```

### Docker
```bash
cp .env.example .env   # adjust values
docker compose up -d --build
open http://localhost:3000
```
Common admin:
```bash
docker compose logs -f app
docker compose down            # stop keep volumes
docker compose down -v         # stop + wipe data
docker compose build --no-cache && docker compose up -d --force-recreate  # force rebuild
```

## Features

- Track multiple addresses (nickname support) and view consolidated BTC perp fills & positions.
- Real‑time WebSocket stream (`/ws`) for incremental trade & position events (adaptive broadcast + heartbeat).
- Time‑based trade pagination (cursor `beforeAt`) with infinite scroll & skeleton loaders.
- Fast in‑memory event queue + durable Postgres storage (`hl_events`, `hl_current_positions`).
- One‑click Refresh All (clear DB + backfill) & Clear (purge only) actions.
- Accessible UI: relative/absolute time toggle, toast notifications, focus styles.
- Deduplication by (time,id) client side; hash stored for future refinement.
- DB indexes for chronological queries (global + per address).

## Data & Storage

| Table | Purpose |
|-------|---------|
| `hl_events` | Append‑only events (type = 'trade' or 'position' JSON payload) |
| `hl_current_positions` | Latest snapshot per address (upserted) |
| `schema_migrations` | Applied migration versions |

### Migrations
SQL lives in `scripts/migrations/` and is applied lexicographically. Run:
```bash
npm run migrate
npm run migrate:status
```
The Docker entrypoint also runs migrations automatically on container start.

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `STORAGE_BACKEND` | memory | `postgres` | `redis` | `memory` |
| `DATABASE_URL` / `PG_CONNECTION_STRING` | – | Postgres connection string |
| `REDIS_URL` | – | Redis connection (optional) |
| `BACKFILL_ON_START` | false | If `true`, clears & seeds initial recent fills on boot |
| `IPINFO_INTERVAL_MS` | 600000 | Interval for IP/region refresh (for display only) |

Removed variables: `POLL_INTERVAL_MS` (poller deprecated).

## HTTP API

Addresses / Nicknames:
- `GET /api/addresses`
- `POST /api/addresses` `{ address }`
- `DELETE /api/addresses/:address`
- `POST /api/addresses/:address/nickname` `{ nickname } | { nickname: "" }` (clear)

Positions & Price:
- `GET /api/current-positions` – consolidated latest positions
- `GET /api/positions/:address` – on‑demand position snapshot
- `GET /api/price` – current BTC price snapshot

Trades:
- `GET /api/latest-trades?limit=200&beforeAt=<ISO>&beforeId=<int>&address=<0x...>` → `{ trades, nextCursor }`
- `GET /api/user-trades/:address` – recent fills direct from Info API (not paginated)
- `POST /api/backfill` `{ address?: string|null, limit?: number }` – light recent fills ingestion
- `POST /api/clear-all-trades` – destructive wipe of all stored trades
- `POST /api/clear-and-backfill-all` – wipe then backfill recent fills for each tracked address

Realtime (HTTP Pull):
- `GET /api/changes?since=<seq>&limit=<n>` – incremental events (used mainly for fallback/debug)

Static UI:
- `GET /` – main interface (module script + realtime)

Deprecated/Removed: `/api/recommendations`, `/api/poll-now`, `/api/cleanup-and-backfill`.

## WebSocket API (`/ws`)

Client connects → server sends:
```json
{ "type": "hello", "latestSeq": 1234 }
```
Client may request backlog:
```json
{ "since": 1200 }
```
Server pushes either incremental batches:
```json
{ "type": "events", "events": [ ... ] }
```
or initial catch-up:
```json
{ "type": "batch", "events": [ ... ] }
```
Event shapes:
```
position: {
  type: 'position', seq, at, address, symbol: 'BTC',
  size, side, entryPriceUsd, liquidationPriceUsd, leverage, pnlUsd
}
trade: {
  type: 'trade', seq, at, address, symbol: 'BTC', side: 'buy'|'sell',
  direction: 'long'|'short'|'flat', effect: 'open'|'close', priceUsd,
  size, realizedPnlUsd?, startPosition?, fee?, feeToken?, hash?, action?
}
```
Heartbeat: server pings every 30s; unresponsive clients are terminated.
Adaptive broadcast interval: 1000ms (≤10 clients), 500ms (≤25), 250ms (>25).

## Pagination Strategy
Trades are ordered by `at desc, id desc`. Cursor = `{ beforeAt, beforeId }` from the last trade in a page. Supplying both ensures that fills sharing the exact same millisecond timestamp remain reachable while still preventing misordering that pure id-based pagination can introduce.

## Refresh & Clear Workflow
UI buttons:
- **Refresh All** → POST `/api/clear-and-backfill-all` then reload first page (fresh consistent base).
- **Clear** → POST `/api/clear-all-trades` (DB wipe only). Real‑time WS will then show only new incoming fills.
Infinite scroll fetches older pages (200/page) as sentinel enters viewport; rate limited client side.

## Development Tips
Run tests:
```bash
npm test
```
Type checking / build:
```bash
npm run build
```

## FAQ

### I don't see new UI changes (e.g., Refresh All / Clear buttons)
1. Confirm you are on the correct branch: `git branch --show-current`.
2. Commit/merge local changes if they are still unstaged.
3. Force a Docker rebuild:
   ```bash
   docker compose build --no-cache
   docker compose up -d --force-recreate
   ```
4. Hard refresh browser: open DevTools → Network tab → check “Disable cache” → Shift+Reload.
5. Ensure no service worker is intercepting (DevTools > Application).

### WebSocket not updating
- Check Network → WS frames; ensure connection to `/ws` upgrades.
- Confirm server logs show WebSocket connections.
- Firewall / corporate proxy can block WS; test with `wscat` or `curl -v` to see 101 upgrade.

### Pagination stopped loading
- If sentinel shows *"No more fills"* you reached oldest stored record.
- If it shows an error: network transient – scroll again (rate limiter 800ms).

### How do I completely reset trade data?
Use **Clear** (UI) or:
```bash
curl -X POST http://localhost:3000/api/clear-all-trades
```
Then optionally run Refresh All for a fresh backfill.

### DB migration errors
- Verify `DATABASE_URL` matches running Postgres.
- Run migrations manually: `npm run migrate` and inspect output.
- If a partial migration applied, fix the SQL then re-run; idempotent `CREATE INDEX IF NOT EXISTS` patterns are used.

### How is dedup handled?
Server: inserts skip when an existing trade with same `hash` for address exists. Client: merges by composite key `id|time` for stable sort.

### Can I extend events with new fields?
Yes – append to the trade payload & update the `ChangeEvent` union (see `src/queue.ts`). Frontend consumes unknown fields gracefully (ignored unless rendered).

### Why time + id ordering?
Ensures deterministic chronology even when two trades share identical millisecond timestamps; `id` breaks ties for stable, repeatable pagination.

### Hard / Force Refresh Summary
| Operation | Action |
|-----------|--------|
| Browser hard reload | Shift + Reload (or Cmd+Shift+R) |
| Disable cache (dev) | DevTools > Network > Disable cache |
| Force rebuild images | `docker compose build --no-cache` |
| Force recreate containers | `docker compose up -d --force-recreate` |
| Purge trade data | POST `/api/clear-all-trades` |
| Clear & reseed trades | POST `/api/clear-and-backfill-all` |

## Roadmap (Potential)
- Client hash-based dedup (instead of id|time) for WS preview rows.
- Position change flashing / diff highlighting.
- Persistent user display preferences (time mode, column order).
- Compression or delta packing for high-volume WS scenarios.

---
Feel free to open issues or adapt for multi-tenant use; current design assumes a controlled address list and moderate real-time event volume.
