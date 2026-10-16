# ChessShorts

A high-performance vertical swipe feed chess puzzle app built with React Native (Expo), Reanimated, and a FastAPI backend with adaptive difficulty.

## Architecture

```
ChessShorts/
├── apps/
│   ├── mobile/          # React Native (Expo SDK 52+) with New Architecture
│   └── api/             # FastAPI + PostgreSQL + asyncpg
├── docker-compose.yml   # Local development stack
└── README.md
```

## Tech Stack

### Mobile
- **Framework**: React Native with Expo SDK 52+ (New Architecture enabled)
- **Feed**: `@legendapp/list` for high-performance virtualization
- **Gestures/Animations**: `react-native-reanimated` + `react-native-gesture-handler`
- **Chess Board**: `react-native-chessboard` (Shopify Skia + Reanimated shared values)
- **Chess Logic**: `chess.js` for move validation
- **State**: Zustand + MMKV persistence
- **Data Fetching**: TanStack Query

### Backend
- **API**: FastAPI with async SQLAlchemy 2.0
- **Database**: PostgreSQL with asyncpg
- **Puzzle Source**: Lichess database (CSV.zst)
- **Adaptive Algorithm**: Rating-band based curation with exclusion of solved puzzles

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.12+
- Docker & Docker Compose (for PostgreSQL)
- Expo CLI: `npm install -g expo-cli eas-cli`

### 1. Start Infrastructure
```bash
docker-compose up -d postgres
```

### 2. Backend Setup
```bash
cd apps/api
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env if needed

# Run migrations (tables created automatically on startup)
uvicorn app.main:app --reload --port 8000
```

### 3. Import Puzzles (Optional - for local data)
```bash
# Download and import a subset for development
python scripts/import_puzzles.py --url https://database.lichess.org/lichess_db_puzzle.csv.zst --limit 100000
```

### 4. Mobile Setup
```bash
cd apps/mobile
npm install
# or yarn install

# Start development server
npx expo start

# For device testing with native modules:
npx expo run:android
npx expo run:ios
```

## Project Structure

### Mobile (`apps/mobile/`)
```
src/
├── api/           # API client (axios + MMKV)
├── components/    # Reusable UI components
├── feed/          # FeedScreen, PuzzleView
├── hooks/         # usePuzzleFeed, usePuzzleLogic
├── store/         # Zustand stores (feed, user, puzzle view)
├── types/         # TypeScript interfaces
└── utils/         # Helpers

app/
├── (tabs)/        # Tab navigation screens
│   ├── feed.tsx
│   └── profile.tsx
├── _layout.tsx    # Root layout with providers
└── index.tsx      # Redirect to feed
```

### API (`apps/api/`)
```
app/
├── api/routes.py      # FastAPI endpoints
├── db/base.py         # Database connection
├── models/            # SQLAlchemy models
├── schemas/           # Pydantic schemas
├── services/feed.py   # Adaptive feed algorithm
└── main.py            # FastAPI app entry

scripts/
└── import_puzzles.py  # Lichess CSV.zst importer
```

## Key Features

### Adaptive Feed Algorithm
- Computes user rating from solved puzzle history (rolling average of last 20)
- Serves 70% puzzles in `rating ± [-120, +80]` band
- 15% easier (`rating -200 to -120`), 15% harder (`rating +80 to +160`)
- Excludes already-solved puzzles
- Penalizes recently-attempted (last 24h)
- Weights by popularity + small random factor

### Puzzle Flow (Lichess Format)
- FEN = position before first move
- Moves = space-delimited UCI sequence: `[player_move, opponent_reply, player_move, ...]`
- Client validates each player move against expected sequence
- Auto-applies opponent replies after correct moves
- Tracks multi-move solutions (mate-in-2, etc.)

### Performance Optimizations
- `@legendapp/list` with `recycleItems` + `pagingEnabled` + `snapToInterval`
- Chessboard runs on UI thread via Skia + Reanimated (zero React re-renders during drag)
- `chess.js` validation only on JS thread after gesture completes
- TanStack Query for caching/prefetching
- MMKV for fast local persistence

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/feed?userId=xxx&offset=0&limit=10` | Get curated puzzle feed |
| POST | `/api/v1/progress` | Submit solve result |
| GET | `/api/v1/progress/{userId}` | Get user progress history |
| GET | `/api/v1/stats/{userId}` | Get user statistics |
| GET | `/api/v1/puzzles/{puzzleId}` | Get single puzzle |
| GET | `/api/v1/health` | Health check |

## Environment Variables

### API (`.env`)
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/chessshorts
ENVIRONMENT=development
```

### Mobile
Configure API base URL in `src/api/client.ts`:
```typescript
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:8000' 
  : 'https://api.yourdomain.com';
```

## Development Notes

### New Architecture Requirements
- Expo SDK 52+ with `"newArchEnabled": true` in app.json
- Development builds required (not Expo Go) for Skia/Reanimated native modules
- Use `npx expo run:android/ios` or EAS Dev Client

### Puzzle Data Format
Lichess CSV columns used:
- `PuzzleId` → `id`
- `FEN` → `fen`
- `Moves` → `moves` (UCI sequence)
- `Rating` → `rating`
- `Popularity` → `popularity`
- `Themes` → `themes` (space-separated → array)

### Testing the Feed
```bash
# Test API directly
curl "http://localhost:8000/api/v1/feed?userId=test_user&offset=0&limit=5"
```

## Deployment

### Option 1: Free Cloud Deploy (Recommended — No Android Studio needed)

#### Backend → Railway (free $5/mo credit)
```bash
# 1. Push to GitHub
git init && git add . && git commit -m "init"
gh repo create chess-shorts --push

# 2. Go to railway.app → New Project → Deploy from GitHub → select repo
# 3. Add PostgreSQL plugin
# 4. Set env vars: DATABASE_URL (auto), ENVIRONMENT=production
# 5. Get your URL: https://chessshorts-api.up.railway.app
```

#### Mobile → EAS Build (30 free builds/mo)
```bash
cd apps/mobile

# 1. Configure production API URL in eas.json (already done)
# 2. Build APK
npm install -g eas-cli
eas login
eas build --profile development --platform android
# → Wait for "Build succeeded" → gives download URL

# 3. On your phone: open the URL → download .apk → install
# 4. For live reload:
npx expo start --dev-client
# Scan QR with the installed app (not Expo Go)
```

### Option 2: Local Development (requires Android SDK)

#### Backend
```bash
docker-compose up -d postgres
cd apps/api && source venv/bin/activate
uvicorn app.main:app --reload --port 8000
# Seed test puzzles:
python scripts/seed_puzzles.py
```

#### Mobile
```bash
cd apps/mobile
# Physical device:
adb reverse tcp:8000 tcp:8000  # makes localhost work on phone
npx expo run:android

# Or emulator:
npx expo run:android
```

### Option 3: Production Deploy

#### Backend
- Build Docker image from `apps/api/Dockerfile`
- Run with managed PostgreSQL (RDS, Cloud SQL, Neon, Supabase)
- Set `DATABASE_URL` and `ENVIRONMENT=production`

#### Mobile
- Build with EAS: `eas build --platform all --profile production`
- Configure production API URL in `eas.json`
- Submit to App Store / Play Store

## License

MIT