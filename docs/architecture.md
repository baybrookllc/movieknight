# StreamSocial — Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│                      movieknight.ca (Vercel)                    │
│                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│   │  Next.js App │  │ Service Worker│  │  Vercel Analytics    │ │
│   │  (App Router)│  │  (sw.js)     │  │  + Speed Insights    │ │
│   └──────┬───────┘  └──────────────┘  └──────────────────────┘ │
└──────────┼──────────────────────────────────────────────────────┘
           │ HTTPS
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Supabase (Backend)                         │
│                                                                  │
│  ┌─────────────────┐  ┌────────────────────────────────────────┐ │
│  │   PostgreSQL    │  │         Edge Functions (Deno)          │ │
│  │                 │  │                                        │ │
│  │  ┌───────────┐  │  │  tmdb-cache      ← TMDB proxy         │ │
│  │  │  tables   │  │  │  semantic-search ← pgvector search     │ │
│  │  │  titles   │  │  │  generate-embed  ← OpenAI embedding    │ │
│  │  │  watch_h  │  │  │  tv-seasons      ← Episode data        │ │
│  │  │  profiles │  │  │  dtdd-fetch      ← Content warnings    │ │
│  │  │  lists    │  │  │  tv-auth         ← TV QR login         │ │
│  │  │  messages │  │  │  delete-account  ← GDPR cleanup        │ │
│  │  └───────────┘  │  └──────────────┬─────────────────────────┘ │
│  │                 │                 │                            │
│  │  ┌───────────┐  │                 ▼                            │
│  │  │pgvector   │  │  ┌────────────────────────────────────────┐ │
│  │  │embeddings │  │  │         External APIs                  │ │
│  │  └───────────┘  │  │  TMDB API  ← Title data & posters      │ │
│  │                 │  │  OpenAI    ← text-embedding-3-small     │ │
│  │  ┌───────────┐  │  │  DTDD API  ← Content warnings          │ │
│  │  │ Row-Level │  │  └────────────────────────────────────────┘ │
│  │  │ Security  │  │                                             │
│  │  └───────────┘  │                                             │
│  └─────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Request Lifecycle

### 1. Page Load
```
User visits movieknight.ca
  → Vercel CDN serves Next.js HTML
  → Client hydrates React
  → Service worker registers
  → AuthProvider checks Supabase session
  → If authenticated: load profile, watch history, badges
```

### 2. Title Search
```
User types query in search bar
  → 400ms debounce
  → Two parallel requests:
      1. tmdb-cache?action=search&query=... (TMDB proxy, caches new titles)
      2. semantic-search?query=... (OpenAI embed + pgvector similarity)
  → Results merged, TMDB results first, semantic results appended
  → TitleCard components rendered
```

### 3. New Title Auto-Embedding
```
User searches for new movie not in DB
  → tmdb-cache fetches from TMDB, inserts into titles table
  → Supabase DB webhook fires (titles INSERT trigger)
  → generate-embedding receives new title
  → Calls OpenAI API to embed title overview
  → Stores vector in title_embeddings table
  → Title is now semantically searchable (~2-3 seconds)
```

### 4. Watch Status Update
```
User clicks status button (Want/Watching/Watched/Dropped)
  → Optimistic UI update (instant visual feedback)
  → supabase.from('watch_history').upsert(...)
  → Supabase RLS validates user_id == auth.uid()
  → On error: revert optimistic update, show toast
```

---

## Database Design Decisions

### Why `id = "movie:550"` format?
Avoids collisions between TMDB movie IDs and TV IDs, which share the same integer space. A movie and TV show can both have `tmdb_id = 550`.

### Why store ratings as integers × 2?
The UI shows half-star ratings (0.5, 1.0, 1.5 ... 5.0). Storing as integer (1–10) avoids floating-point precision issues in PostgreSQL comparisons and indexing.

### Why pgvector over a dedicated vector DB?
Keeping embeddings in PostgreSQL collocates them with title metadata, enabling JOIN queries (e.g., "find similar titles I haven't watched"). Avoids a separate service to maintain. HNSW index gives sub-10ms query times for our catalog size (<10K titles).

### Why RLS over application-level filtering?
Defense in depth — even if app-level code has a bug, RLS prevents data leakage. Supabase's anon key is safe to expose in client code because RLS enforces access at the database level.

---

## Edge Function Design Patterns

### CORS Handling
All edge functions:
1. Check `Origin` header against an allowlist
2. Return matching origin (or fallback to primary domain)
3. Handle OPTIONS preflight before any logic
4. Include `Vary: Origin` to prevent caching across origins

```typescript
const ALLOWED_ORIGINS = new Set([
  "https://movieknight.ca", "https://www.movieknight.ca",
  "http://localhost:3000",
]);
function makeCors(req: Request) {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(o) ? o : "https://movieknight.ca",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
```

### Rate Limiting (In-Memory Sliding Window)
Edge function instances are reused for ~30s. A Map-based rate limiter works for burst protection:

```typescript
const rlStore = new Map<string, { count: number; windowStart: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rlStore.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    rlStore.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX) return false;
  entry.count++;
  return true;
}
```

Limitation: Resets on cold start. For strict limits, use Redis (Upstash).

---

## Authentication Flow

```
Signup:
  supabase.auth.signUp({ email, password })
    → Supabase creates auth.users row
    → DB trigger handle_new_user() fires
    → Inserts profile row (display_name, avatar_id)
    → Returns JWT (access_token + refresh_token)
    → Stored in cookie (Supabase SSR)

Login:
  supabase.auth.signInWithPassword({ email, password })
    → Returns JWT
    → Cookie set

Per-request:
  Authorization: Bearer <JWT>
    → Supabase validates signature
    → auth.uid() resolves to user UUID
    → RLS policies evaluated
```

---

## Caching Strategy

| Layer | Cache | TTL | Invalidation |
|-------|-------|-----|--------------|
| Vercel CDN | Static assets (JS/CSS) | Immutable | Deploy |
| Service Worker | App shell (HTML/JS) | Version-based | SW update |
| Service Worker | TMDB poster images | 7 days | LRU (500 entries) |
| Supabase | Title metadata | 7 days (recent) / 30 days (old) | force=true param |
| Supabase | DTDD content warnings | 30 days | Cache table TTL |

---

## Security Layers

```
1. Network: HTTPS everywhere (Vercel + Supabase)
2. Auth: Supabase JWT (RS256) — auto-refresh on expiry
3. Authorization: RLS on every user-facing table
4. Input: HTML escaping in React (XSS prevention)
5. API: Anon key restricted by RLS (safe to expose)
6. Edge: CORS allowlist on all edge functions
7. DB: CHECK constraints on avatar_url, message length
8. Rate: In-memory rate limiting per IP per function
9. Webhook: HMAC signature on DB webhook secret
```
