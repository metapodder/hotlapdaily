# Architecture

Hotlap Daily has two cleanly separated halves:

1. **The Next.js app** (`src/`) — server-rendered shell, API routes, admin
   dashboard, and the pluggable data layer.
2. **The client game engine** (`public/game/`) — a vanilla-JS canvas game,
   shipped as static ES modules, that runs independently of React once the page
   has mounted.

They communicate only over `/api/*` (JSON). The game never imports React, and
React never imports the engine — the page just mounts a `<canvas>` and loads
`/game/engine.js` as a module script.

```
┌──────────────────────────── browser ────────────────────────────┐
│  page.tsx renders <canvas> ──▶ /game/engine.js (module)          │
│        │                              │                          │
│        │                     requestAnimationFrame loop          │
│        │                              │                          │
│        └───────── fetch /api/* ◀──────┘                          │
└───────────────────────────────│──────────────────────────────────┘
                                 ▼
┌──────────────────────────── server (Next.js) ───────────────────┐
│  /api routes ──▶ prisma (pluggable) ──▶ memory store | PostgreSQL │
└───────────────────────────────────────────────────────────────────┘
```

## 1. The client game engine — `public/game/`

The engine is organized by concern. `engine.js` is the **orchestrator**: it owns
the `Game` class, the `requestAnimationFrame` loop, game state, and lap logic,
and delegates everything else to focused modules.

| Layer        | Path                       | Responsibility                                              |
|--------------|----------------------------|-------------------------------------------------------------|
| Orchestrator | `engine.js`                | `Game` class, game loop, state, lap/checkpoint logic        |
| Physics      | `physics/controller.js`    | `CarController`: time-based car physics, keyboard/touch input |
| Physics      | `physics/physics.js`       | Physics constant capture + validation (anti-cheat input)    |
| Render       | `render/draw.js`           | Canvas primitives: track, pixel-art car, direction arrows   |
| Render       | `render/colors.js`         | Color helpers (team colors, lighten/darken)                 |
| Anti-cheat   | `anticheat/anticheat.js`   | `AntiCheatSystem`: checkpoint coverage, line-crossing checks |
| Net          | `net/api.js`               | All `/api/*` fetch calls (best-lap, challenge, leaderboard) |
| Net          | `net/telemetry.js`         | Lightweight client telemetry                                |
| Tracks       | `tracks/tracks.js`         | Track generator functions + client-side fallback track      |
| UI           | `ui/ui.js`                 | DOM/HUD handlers                                            |
| UI           | `ui/leaderboard.js`        | In-game leaderboard rendering                               |
| UI           | `ui/share.js`              | Share-card image generation                                 |
| Util         | `util/geometry.js`         | Pure geometry helpers (point-to-segment distance)           |

Module paths are absolute from the public root (e.g. `/game/render/draw.js`), so
they resolve the same in dev and production. `engine.js` exposes the game via
`window.Game` and is initialized by `page.tsx`.

### Why `engine.js` stays large

The orchestrator still contains the rendering, ghost-replay, and lap clusters.
These are tightly bound to live `Game` state through `this` and in-place
closures (e.g. `(function (self) { ... })(this)`), so they are kept in the
orchestrator rather than split into free functions — pulling them out safely
requires interactive playtesting of the canvas game. The concern modules above
already isolate the reusable mechanics; further decomposition of the orchestrator
is a good follow-up once a playtest harness exists.

## 2. The Next.js app — `src/`

### Pluggable data layer

All persistence goes through a single client exported from
[`src/lib/prisma.ts`](src/lib/prisma.ts). At runtime it resolves a backend:

- **`memory`** (default when no `DATABASE_URL`): an in-memory store in
  [`src/lib/db/memoryClient.ts`](src/lib/db/memoryClient.ts) that implements the
  exact subset of the Prisma delegate API the routes use (`create`, `findMany`,
  `findUnique`, `findFirst`, `count`, `upsert`, `update`, `delete`,
  `deleteMany`) with the `where`/`orderBy`/`select`/`take` features they rely on.
  It optionally persists to `./.data/hotlap-db.json`.
- **`postgres`** (default when `DATABASE_URL` is set): the real Prisma client,
  lazily required so the in-memory default never needs a generated engine or a
  live connection.

Because both backends expose the same shape, **every API route is written once**
and works against either store. The selector is the only place that knows which
backend is live.

### API routes — `src/app/api/`

| Route                     | Purpose                                                        |
|---------------------------|----------------------------------------------------------------|
| `challenge`               | Issues a proof-of-work + HMAC challenge bound to the session   |
| `best-lap`                | Validates and stores a lap submission                          |
| `track`                   | Serves the track function for a given day/track id             |
| `track-leaderboard`       | Top laps for one track (all-time)                              |
| `global-leaderboard`      | Per-day, per-driver-best leaderboard                           |
| `rank`                    | A driver's rank for a day                                      |
| `ghost-trace`             | Replay trail for a given race id                               |
| `submit-track`            | Community track submissions                                    |
| `feedback`                | Player feedback                                                |
| `wrapped`                 | Year-in-review stats (cached per user/year)                    |
| `dashboard`, `dashboard/auth` | Admin track review/management (cookie-gated)               |

### Anti-cheat flow

Lap submission is defended in depth:

1. The client requests a challenge from `/api/challenge` (HMAC-signed, bound to a
   session cookie + user-agent hash, with a proof-of-work prefix).
2. The `AntiCheatSystem` validates the lap client-side (checkpoint coverage and
   line-crossing order).
3. The client solves the proof-of-work and POSTs an encoded submission to
   `/api/best-lap`.
4. The server re-validates everything: HMAC signature, session/UA binding, PoW,
   timestamp freshness, and physics constants — independent of the client's
   own checks.

### Track generation

Daily tracks map to a `trackId` derived from the UTC date. Track functions are
stored in the `track_functions` table (or generated/auto-selected from community
submissions). The client also ships built-in generator functions in
`public/game/tracks/tracks.js` and falls back to a default track if the API has
nothing — which is why the game is playable against an empty database.

## Data model (`prisma/schema.prisma`)

Five tables: `best_laps`, `submitted_tracks`, `track_functions`, `wrapped`,
`feedback`. The schema targets PostgreSQL; the in-memory backend models the same
shapes in plain objects (with `bigint` autoincrement ids for `submitted_tracks`
and UUIDs elsewhere).
