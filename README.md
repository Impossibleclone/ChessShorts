# ChessShorts

A vertical-swipe feed of chess puzzles with **adaptive difficulty**, built with React Native (Expo, New Architecture) on a FastAPI + PostgreSQL backend, sourced from the Lichess puzzle database.

> **Status**: backend is **live** on Render + Neon (500k puzzles loaded); Android test APKs are built via EAS and published as GitHub Releases. White-screen boot bug is under investigation with a boot self-test build (see *Mobile → Boot self-test*).

## Architecture

```
ChessShorts/
├── apps/
│   ├── mobile/          # React Native — Expo SDK 52, New Architecture
│   │   ├── app/         # Expo Router screens  ((tabs)/feed, profile)
│   │   ├── src/         # api client, feed screens, hooks, stores, boot probe
│   │   └── android/     # prebuilt native project (committed; arm64-v8a release)
│   └── api/             # FastAPI — async SQLAlchemy 2 + asyncpg
│       ├── app/         # routes, models, schemas, services (feed algorithm)
│       └── scripts/     # puzzle import / seed utilities
├── .github/workflows/ci.yml
└── docker-compose.yml   # local Postgres for development
```

| Piece | Tech |
|---|---|
| Feed list UI | `@legendapp/list` (recycleItems, snap-per-screen) |
| Gestures / animation | `react-native-reanimated` + `react-native-gesture-handler` |
| Chess board | `react-native-chessboard` 0.1.2 over `@shopify/react-native-skia` |
| Chess rules | `chess.js` |
| State | Zustand + MMKV persistence |
| Data | TanStack Query + axios |
| API | FastAPI, SQLAlchemy async, asyncpg |
| Puzzle source | Lichess puzzle database (CSV.zst), 500,000 rows live (popularity ≥ 70 filter) |

## Live deployment (current)

- **API**: https://chessshorts.onrender.com — Render web service (Docker, free tier)
  - `/api/v1/health` → `{"status":"ok","db":"ready","version":"<git-sha-7>"}` (commit SHA is baked at Docker build from `RENDER_GIT_COMMIT`)
  - Startup is resilient: DB connect retries with backoff, never crash-loops; the app stays up and health reports `db_error` while env is being fixed
- **Database**: Neon Postgres (`ep-dark-unit-a1ier2qm-pooler`, ap-southeast-1), 500k puzzles ≈ 137 MB
  - `DATABASE_URL` must be the asyncpg form: `postgresql+asyncpg://user:pass@…-pooler…neon.tech/neondb?sslmode=require` — `sslmode`/`channel_binding` query params are stripped by `app/db/base.py`, which attaches a verified TLS context itself
  - DB status endpoint contract for the feed is camelCase (`nextOffset`, `userId`, `solveTimeMs` … — set in `app/schemas/__init__.py` via `alias_generator=to_camel`)
- **Auto-deploy**: Render *Deploys → Settings → Auto-Deploy* must be ON for main; manual **Deploy latest commit** works anytime. API version visible via `/health` `version`.

### Local backend

```bash
docker compose up -d postgres
cd apps/api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
./venv/bin/uvicorn app.main:app --reload --port 8000
```

Tables are created automatically at startup (`init_db`). Seed/dev helpers live in `apps/api/scripts/` (`seed_puzzles.py` for 10 quick hand-picked puzzles).

### Bulk import from the Lichess database

```bash
cd apps/api
./venv/bin/python scripts/import_puzzles.py \
  --file ~/dls/lichess_db_puzzle.csv.zst \
  --limit 500000 --min-popularity 70
```

- Streams the `.zst` to a temp CSV (polars does not auto-decompress zstd), quality-filters (`Popularity ≥ N`), dedupes by `PuzzleId`, and bulk-inserts via `asyncpg executemany` on the **direct** Neon endpoint (`-pooler.` stripped) — ~500k rows in ≈ 4 min.
- Growth beyond ~1.8M rows exceeds Neon free storage (~0.5 GB); check `pg_total_relation_size('puzzles')`.

## Mobile

```bash
cd apps/mobile
npm install --legacy-peer-deps     # peer deps require it
npx tsc --noEmit                   # typecheck
```

### Build & ship an APK (no Android Studio needed)

```bash
npx eas login
eas build --profile preview --platform android   # release APK, arm64-v8a only
```

- eas.json env: `EXPO_PUBLIC_API_URL=https://chessshorts.onrender.com` (all profiles), production profile ships an AAB.
- Release APKs target **arm64-v8a only** via `reactNativeArchitectures` in `android/gradle.properties` (the universal 4-ABI build was 134 MB — Skia `.so` per CPU architecture is the bulk; single-ABI drops it to ~45 MB).
- CI (`.github/workflows/ci.yml`) runs `tsc --noEmit` + API `compileall` — no secrets required.

### Boot self-test (temporary diagnostic gate)

Because a white-screen-on-start bug has not been reproduced from logs yet, `app/_layout.tsx` guards the real app behind `EXPO_BOOT_PROBE=true` (set in eas.json `preview.env`):

- The boot probe renders immediately (only `react`/`react-native` static imports) and `require()`s each risky module **inside try/catch**, painting `✓/✗ name (ms)` per step: env → gesture-handler → mmkv(+instance) → react-query → reanimated → `@legendapp/list` → **skia (paints a live circle)** → chessboard → api client → store.
- A global `ErrorUtils` handler also displays async/global JS errors on screen.
- **"▶ Start app"** mounts the real tree afterwards.
- To restore the normal boot, set `EXPO_BOOT_PROBE=false` (or remove the gate) in `eas.json` and rebuild.

### API contract (mobile ↔ backend)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/feed?userId=…&offset=0&limit=10` | camelCase query param + `nextOffset` in response |
| POST | `/api/v1/progress` | body `userId/puzzleId/solved/solveTimeMs` |
| GET | `/api/v1/progress/{userId}` | history, camelCase incl. `attemptsCount` |
| GET | `/api/v1/stats/{userId}` | `solvedCount`, `totalAttempts`, `accuracy`, `rating` |
| GET | `/api/v1/puzzles/{puzzleId}` | single puzzle |
| GET | `/api/v1/health` | `status`, `db` (`ready`/`error`/`starting`), `version`, `db_error` when failing |

### Adaptive difficulty

- User rating = average of the rating of their **last 20 solved** puzzles (subquery window, `app/services/feed.py`).
- Bands per page: ~70% primary (`rating ±[-120,+80]`), 15% easy (−200..−120), 15% hard (+80..+160); fallback ±400 band when empty.
- Excludes solved puzzles and everything attempted in the last 24 h; weight-distanced by |rating − user_rating|, popular-first, plus randomness for variety.

### Puzzle line format (Lichess)

- `Moves` = space-delimited UCI starting with the **opponent's "needle" move**: `[opponent, player, opponent, …]`. The stored `FEN` is one half-move **before** the needle (it is the opponent's turn there). This is verified from the raw database — parity test on `mateIn1/2/3` gives lengths 2/4/6.
- The client auto-plays the needle on setup (so the solver always gets their color to move), orients the board to the solver via the patched `flipBoard` prop on `react-native-chessboard`, validates each player move with chess.js, and auto-plays opponent replies ~0.4 s later. Solved when the full line (post-needle) is played.

## Environment

### API (`apps/api/.env`, git-ignored)

```env
DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
ENVIRONMENT=development
```

### Mobile (`apps/mobile/eas.json` → build env)

```env
EXPO_PUBLIC_API_URL=https://chessshorts.onrender.com
EXPO_PUBLIC_BOOT_PROBE=true  # boot probe defaults ON when unset; set false for a clean boot
```

> Env vars are inlined into release bundles by Expo's Babel transform, but **only** when
> referenced as direct `process.env.EXPO_PUBLIC_X` member expressions. Reading through an
> alias (`const env = process.env; env.EXPO_PUBLIC_X`) silently yields `undefined` at
> runtime — this disabled the boot-probe gate in early diagnostic builds.

## Deployment notes / gotchas learned

- **Neon**: rotate leaked credentials; serve the app off the `-pooler` endpoint; bulk import off the direct one. `channel_binding=require` in the URL is harmless — the engine strips it.
- **Render**: set `DATABASE_URL` as one line, no quotes/placeholders; redeploys are slow on free tier (~5–10 min), verify via `/health` `version`.
- **Polars 2.x** cannot read `.csv.zst` natively here — the import script decompresses to a temp file first.
- **expo-router needs `query-string`** as an explicit dependency under npm (SDK 52 quirk) — and it must be the **v7 CJS shape** (`"query-string": "7.1.3"`, pinned exact). v8/v9 ship a CJS entry with only `{ __esModule, default }`; Metro bundles that shape, expo-router's forked `getPathFromState` calls `queryString.stringify(...)` on it, gets `undefined`, and throws `TypeError: undefined is not a function` mid-render of `BottomTabBar` → React unmounts the tree → plain white window. Don't bump this dependency.
- These pitfalls were fixed; don't re-add reanimated to `app.json` plugins (Babel plugin alone is correct for this RN/SDK combo).
- **Release-build white screens have two distinct causes**, both bypassing the `ErrorBoundary` (so a white window with no dark "⚠ App failed to start" screen is the signature):
  1. A module-eval/route-load throw outside React's render phase — e.g. the `query-string` trap above.
  2. An exception inside a **Reanimated worklet**: worklets execute on the UI thread, where neither React error boundaries nor `ErrorUtils`'s global JS handler can observe them, so the app tears down with zero log. Anything on a scroll/gesture worklet path is a hard-to-debug white-screen risk. The feed therefore stays on core RN `Animated` (native driver) + `ScrollView`'s plain-JS scroll callbacks — `react-native-chessboard` may still use Reanimated internally (that path is proven on-device), but app code should not introduce new worklet surfaces.
- **Feed safeguards (current build):** only the active card and its neighbors mount a real `Chessboard` (32 animated pieces each — ten at once froze the first drag for seconds); every card is wrapped in a per-card `ErrorBoundary` (`src/feed/CardBoundary.tsx`) so a JS-level render error shows a "swipe for the next one" fallback instead of whiting the whole feed; opponent pieces are inert via the patched `movableColor` prop regardless of engine turn, and the opponent's opening needle move animates visibly after a short prelude instead of being pre-applied silently.

## License

MIT
