# StreamSocial

> A dark-mode movie and TV tracking app with semantic search, episode tracking, and collaborative lists.

**Live:** https://movieknight.ca  
**Current Version:** v6.0 (May 21, 2026 · 21:30 UTC)  
**Status:** 🟢 Production-ready · SSR hero recommendations · Automated deployments · Health monitoring

---

## 🎯 Features

- **Semantic Search** — Find titles by mood/vibe ("mind-bending thriller", "cozy comfort watch")
- **Episode Tracking** — Mark individual episodes as watched with persistent state
- **Smart Browsing** — 9-filter system (Genre, Rating, Year, Format, Platform, Runtime, Country, CVRS, Language)
- **Social Features** — Public/private watchlists, community ratings, share by username
- **Content Warnings** — Integration with DoesTheDogDie.com (DTDD) for trigger warnings
- **User Profiles** — Avatar generation, genre DNA, watch history
- **Real-time Sync** — All data persists across devices via Supabase

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16.2.6, React 19, TypeScript |
| **Backend** | Supabase (PostgreSQL + Edge Functions) |
| **Search** | OpenAI `text-embedding-3-small` + pgvector |
| **Data Source** | TMDB API (proxied via edge function) |
| **Hosting** | Vercel (movieknight.ca alias) |
| **Auth** | Supabase Auth (email/password + JWT) |

---

## 📋 Prerequisites

- **Node.js** 18+ (v24 LTS recommended)
- **npm** or **yarn**
- **Supabase CLI** (for local development)
- **Vercel CLI** (for deployment)
- **Git**

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd Streamsocial
npm install
```

### 2. Environment Setup

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://nwvliipxqedueskhxdym.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dmxpaXB4cWVkdWVza2h4ZHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTkwNjAsImV4cCI6MjA4ODU3NTA2MH0._5XQeRRlNjvCegnC-n9p3mMmPYdbITESV5vojoHF4yg
```

### 3. Run Dev Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## 📁 Project Structure

```
Streamsocial/
├── app/                        # Next.js app router
│   ├── (app)/                 # Main app layout
│   │   ├── browse/            # Browse/filter page
│   │   ├── mood/              # Semantic search (mood filter)
│   │   ├── [titleId]/         # Title detail page
│   │   ├── lists/             # User's watchlists
│   │   ├── profile/           # User profile
│   │   └── ...
│   ├── login/                 # Auth pages
│   └── globals.css
├── components/                 # React components
│   ├── BrowseClient.tsx       # Browse + filters logic
│   ├── TitleCard.tsx          # Title card component
│   ├── DetailClient.tsx       # Title detail page
│   └── ...
├── lib/
│   ├── supabase.ts            # Supabase client config
│   ├── utils.ts               # Shared utilities
│   ├── types.ts               # TypeScript types
│   └── version.ts             # Version constant
├── supabase/
│   ├── migrations/            # Database migrations
│   └── functions/             # Edge functions
│       ├── semantic-search/   # Mood-based search
│       ├── tmdb-cache/        # TMDB API proxy + cache
│       ├── generate-embedding/# Embedding generation
│       ├── tv-seasons/        # TV episode data
│       ├── dtdd-fetch/        # Content warnings
│       └── ...
├── public/                     # Static assets
├── .env.local                 # Local secrets
├── package.json
├── tsconfig.json
├── next.config.js
└── CLAUDE.md                  # Project guide (agents)
```

---

## 🗄️ Database Schema (Key Tables)

### `titles`
Core title catalog from TMDB. Indexed for popularity, rating, release date.

```sql
id (text, PK)           -- "movie:550" or "tv:1396"
title, overview, poster_path, backdrop_path
release_date, vote_average, runtime, original_language
origin_country, certification_ca
cached_at, tmdb_id
```

### `title_embeddings`
Vector embeddings for semantic search. Generated via `generate-embedding` edge function.

```sql
title_id (FK→titles.id)
embedding (vector(1536))
embedded_at
```

### `watch_history`
User's watch status and ratings. Row-level security (owner can read/write).

```sql
id, user_id (FK→auth.users), title_id (FK→titles.id)
status ('want_to_watch' | 'watching' | 'watched' | 'dropped')
rating (int, stored as 1-10, displayed as 0.5-5 stars)
episode_season, episode_number (for TV episodes)
watched_at
```

### `custom_lists`
User-created watchlists with sharing support.

```sql
id, owner_id, title (name), description
is_public, created_at
```

### `list_items`, `list_members`
Items in a list and members with roles (editor/viewer).

---

## 🔄 Data Flow

### Search Flow
1. User enters query in Browse/Mood pages
2. **TMDB search**: `tmdb-cache` function searches TMDB, caches results
3. **Semantic search**: `semantic-search` embeds query via OpenAI, queries pgvector index
4. Results merged and deduplicated client-side

### Embedding Generation
1. New title inserted via TMDB search
2. **Database webhook** triggers `generate-embedding` edge function
3. Function embeds title overview via OpenAI
4. Embedding stored in `title_embeddings` table
5. Title now searchable via Mood page

### Watch Tracking
1. User updates status (Want/Watching/Watched/Dropped)
2. Client calls `watch_history` upsert (episode-level for TV)
3. Supabase RLS ensures user can only modify own records
4. Status persists across sessions

---

## 🚀 Deployment (Automated)

### Prerequisites
- Vercel account linked to repo
- Supabase project (CLI authenticated via `supabase login`)
- GitHub repository connected (for CI/CD and auto-migrations)

### Auto-Deploy to Production

```bash
# 1. Make changes + create migration (if schema change)
git add supabase/migrations/20260522000000_feature.sql
git add app/...

# 2. Push to master
git commit -m "feat: Add feature"
git push origin master

# 3. Automatic deployment happens:
# → GitHub Actions: lint, type-check, build, security audit
# → GitHub Action: deploy-migrations.yml applies migrations to Supabase
# → Vercel: auto-deploys to production
# ✅ Done!
```

### CI/CD Pipeline

**Active Workflows** (in `.github/workflows/`):
- `ci.yml` — Lint & TypeScript checks on every push/PR
- `deploy-migrations.yml` — Auto-apply Supabase migrations on master (v6.1+)
- `health-check.yml` — 5-minute health monitoring + Slack alerts
- `deploy-notify.yml` — Post deployment status to PR comments

**View Workflow Runs:**
https://github.com/baybrookllc/movieknight/actions

### Manual Edge Function Deployment

```bash
# Redeploy all functions
supabase functions deploy --project-ref nwvliipxqedueskhxdym

# Or redeploy specific function
supabase functions deploy semantic-search --project-ref nwvliipxqedueskhxdym
```

### Manual Database Migrations

```bash
# View applied migrations
supabase migration list --linked

# Push pending migrations (or let GitHub Action do it)
supabase db push --linked

# View function logs
supabase functions logs semantic-search
```

### Vercel Config

**v6.1+ Update:** Configuration migrated to TypeScript
- File: `vercel.ts` (replaces old `vercel.json`)
- Benefits: Type-safe, environment-aware, dynamic configuration
- Auto-detected by Vercel — no action needed

---

## 🔐 Security

- **Authentication**: Supabase Auth (JWT tokens, email/password)
- **Authorization**: Row-Level Security (RLS) on all user-facing tables
- **API Keys**: Supabase anon key in `.env.local` (public, sandboxed by RLS)
- **Service Role**: Private key in Supabase secrets only (never in code)
- **Edge Functions**: CORS allowlist (`movieknight.ca`, localhost, preview URLs)
- **Content**: All user input escaped before rendering (XSS protection)

---

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Supabase Connection Issues
```bash
# Verify credentials in .env.local
# Test connection:
supabase status --linked

# Reset local database:
supabase db reset
```

### Edge Functions Not Deploying
```bash
# Check function syntax
supabase functions deploy semantic-search --project-ref nwvliipxqedueskhxdym --debug

# View function logs
supabase functions logs semantic-search --project-ref nwvliipxqedueskhxdym
```

---

## 📊 Performance

- **Core Web Vitals**: LCP < 3.5s, FID < 100ms, CLS < 0.1
- **Bundle Size**: ~180KB (gzipped)
- **Code Splitting**: `AwardsSection` and `SeasonsPanel` lazy-loaded
- **Image Optimization**: TMDB posters cached via service worker (7-day TTL)
- **Database**: Query optimization via indexes on popularity, rating, release_date

Monitored via:
- **Vercel Analytics** (real user metrics)
- **Speed Insights** (Core Web Vitals)
- **Lighthouse CI** (automated builds)

---

## 🤝 Contributing

1. Create a feature branch from `main`
2. Make changes and test locally (`npm run dev`)
3. Run build (`npm run build`) and type check
4. Commit with clear messages
5. Push and open a pull request

### Code Style
- **TypeScript** for type safety
- **ESLint** for linting (configured in `next.config.js`)
- **Prettier** for formatting (via pre-commit hooks)

---

## 📚 API Documentation

See [CLAUDE.md](./CLAUDE.md) for:
- Edge function endpoints and parameters
- RPC function signatures
- Database schema details
- Rate limits and quotas

---

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history, features added, and bug fixes.

---

## 🎓 Key Concepts

### pgvector & Semantic Search
- Titles are embedded using OpenAI `text-embedding-3-small` (1536 dimensions)
- Stored in `title_embeddings` with HNSW index for fast similarity search
- User queries are embedded and compared to find semantically similar titles
- Threshold of 0.3 similarity to avoid spurious results

### Row-Level Security (RLS)
- `watch_history`: Only user can see/modify own records
- `custom_lists`: Owner + members can read; public lists readable by all
- `messages`: Only sender/receiver can read; sender can insert

### Database Webhook
- Fires on `titles` INSERT
- Calls `generate-embedding` edge function with Authorization header
- Backfills embeddings if title was manually added

---

## 📞 Support

For issues or questions:
1. Check [CLAUDE.md](./CLAUDE.md) project guide
2. Review [CHANGELOG.md](./CHANGELOG.md) for known issues
3. Open an issue on GitHub with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/OS version

---

**Made with ❤️ using Vercel, Supabase, and OpenAI**
