# StreamSocial — Database Reference

## Connection Details

| Setting | Value |
|---------|-------|
| Project Ref | `nwvliipxqedueskhxdym` |
| Region | `us-east-1` |
| Dashboard | https://supabase.com/dashboard/project/nwvliipxqedueskhxdym |
| REST URL | `https://nwvliipxqedueskhxdym.supabase.co/rest/v1/` |
| Functions URL | `https://nwvliipxqedueskhxdym.supabase.co/functions/v1/` |

---

## Full Schema

### `titles`
Core title catalog from TMDB.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | text | NO | PK. Format: `"movie:550"` or `"tv:1396"` |
| `tmdb_id` | integer | NO | Raw TMDB ID |
| `media_type` | text | NO | `"movie"` or `"tv"` |
| `title` | text | NO | |
| `overview` | text | YES | |
| `poster_path` | text | YES | Relative TMDB path |
| `backdrop_path` | text | YES | Relative TMDB path |
| `release_date` | date | YES | NOT `release_year` — actual DB type is `date` |
| `vote_average` | float | YES | TMDB community rating |
| `popularity` | float | YES | TMDB popularity score |
| `cached_at` | timestamptz | NO | NOT `created_at` |
| `runtime` | integer | YES | Minutes for movies; min/ep for TV |
| `original_language` | text | YES | ISO 639-1 (e.g., `"en"`, `"fr"`, `"ko"`) |
| `origin_country` | text | YES | ISO 3166-1 (e.g., `"US"`, `"CA"`, `"JP"`) |
| `certification_ca` | text | YES | Canadian rating (e.g., `"PG"`, `"14A"`, `"18+"`) |

**Indexes:**
- `titles_pkey` — `id` (PK)
- `idx_titles_popularity` — `popularity DESC`
- `idx_titles_vote_average` — `vote_average DESC`
- `idx_titles_release_date` — `release_date DESC`
- `idx_titles_feed_eligible` — partial on `vote_average DESC WHERE poster_path IS NOT NULL AND vote_average >= 6.0`

---

### `title_embeddings`
Vector embeddings for semantic search.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `title_id` | text | NO | FK → `titles.id` |
| `embedding` | vector(1536) | NO | OpenAI text-embedding-3-small |
| `embedded_at` | timestamptz | NO | |

**Indexes:**
- `title_embeddings_embedding_idx` — HNSW on `embedding vector_cosine_ops`

---

### `genres`
TMDB genre catalog (synced once, 27 genres).

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer | PK |
| `name` | text | e.g., `"Action"`, `"Drama"` |
| `tmdb_id` | integer | |
| `media_type` | text | `"movie"` or `"tv"` |

---

### `title_genres`
Many-to-many: titles ↔ genres.

| Column | Type | Notes |
|--------|------|-------|
| `title_id` | text | FK → `titles.id` |
| `genre_id` | integer | FK → `genres.id` |

**Unique constraint:** `(title_id, genre_id)`
**Indexes:** `idx_title_genres_genre_title` — `(genre_id, title_id)` covering

---

### `profiles`
Extended user data (extends `auth.users`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, FK → `auth.users.id` |
| `display_name` | text | |
| `avatar_id` | text | DiceBear seed |
| `notify_weekly` | boolean | |
| `notification_email` | text | |
| `last_seen` | timestamptz | |
| `tw_enabled` | boolean | Content warnings toggle |
| `avatar_url` | text | CHECK: must start with `https://` |

---

### `watch_history`
User tracking data. One row per user+title (or per user+episode for TV).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | DEFAULT `auth.uid()` — never send from client |
| `title_id` | text | FK → `titles.id` |
| `status` | text | `want_to_watch \| watching \| watched \| dropped \| not_interested` |
| `rating` | integer | 1–10 internally (divide by 2.0 for star display) |
| `episode_season` | integer | NULL for movies |
| `episode_number` | integer | NULL for movies |
| `watched_at` | timestamptz | |

**Unique constraint:** `(user_id, title_id, episode_season, episode_number)`
**Indexes:**
- `idx_watch_history_user_id`
- `idx_watch_history_user_episode` — `(user_id, title_id, episode_season, episode_number)`
- `idx_watch_history_user_date` — `(user_id, watched_at DESC)`

---

### `custom_lists`
User-created watchlists.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `owner_id` | uuid | FK → `auth.users` |
| `title` | text | NOT `name` |
| `description` | text | |
| `is_public` | boolean | |
| `created_at` | timestamptz | |

---

### `list_items`
Titles in a list.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `list_id` | uuid | FK → `custom_lists.id` |
| `title_id` | text | FK → `titles.id` |
| `added_by` | uuid | FK → `auth.users`, nullable |
| `added_at` | timestamptz | NOT `created_at` |

---

### `list_members`
Shared list members.

| Column | Type | Notes |
|--------|------|-------|
| `list_id` | uuid | FK → `custom_lists.id` |
| `user_id` | uuid | FK → `auth.users` |
| `role` | text | `"editor"` or `"viewer"` |

---

### `messages`
Direct messages between users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `sender_id` | uuid | FK → `auth.users` |
| `receiver_id` | uuid | FK → `auth.users` |
| `content` | text | CHECK: max 5000 chars |
| `created_at` | timestamptz | |
| `read_at` | timestamptz | NULL = unread |

---

### `dtdd_cache`
Cached content warnings from DoesTheDogDie.com API.

| Column | Type | Notes |
|--------|------|-------|
| `title_id` | text | PK, FK → `titles.id` |
| `topics` | jsonb | Array of `{topicKey, topicName, yesSum, noSum}` |
| `cached_at` | timestamptz | 30-day TTL |

**Indexes:**
- `idx_dtdd_cache_topics_gin` — GIN on `topics` (fast JSONB filtering)

---

### `user_trigger_prefs`
User's trigger warning preferences.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | FK → `auth.users`, part of PK |
| `topic_key` | text | DTDD topic key (e.g., "dog dies"), part of PK |
| `action` | text | `'flag'` (show badge) or `'hide'` (filter out) |

**Unique constraint:** `(user_id, topic_key)`
**RLS:** User can only read/write own preferences

---

### `title_streaming_platforms`
Titles available on streaming services (future data source: TMDB watch providers).

| Column | Type | Notes |
|--------|------|-------|
| `title_id` | text | FK → `titles.id` |
| `platform_id` | integer | FK → `streaming_platforms.id` |

---

### `streaming_platforms`
Catalog of streaming services (Netflix, Prime, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer | PK |
| `name` | text | e.g., `"Netflix"`, `"Prime Video"` |
| `logo_path` | text | TMDB provider logo URL |

---

## Commerce (Phase P0 — added 2026-07-12)

Physical-media commerce schema from `supabase/migrations/20260712000001_commerce_schema.sql`.
First-party retail MVP with a marketplace-ready shape (`listings.seller_id` nullable = first-party).
All money is stored in **integer cents**. Design rationale and phasing:
`ADAM_DOCS/commerce-vertical-plan.md`.

> **Status:** migration committed (`84b6be7`) and validated locally against an isolated Postgres instance (`a34815d`, 2026-07-13 — schema, indexes, seeds, RLS across 12 scenarios, all pass) but **not yet applied** to the live DB. Applies automatically via `deploy-migrations.yml` on the next push to `origin/master`.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `product_editions` | A physical edition of a `titles` row | `title_id → titles(id)`, `format` (dvd/bluray/4k/vhs/boxset), `edition_name`, `region`, `upc` |
| `listings` | Something for sale | `edition_id`, `seller_id → auth.users` (**NULL = first-party**), `condition`, `price_cents`, `currency`, `quantity`, `status` |
| `carts` / `cart_items` | Server-persisted cart (one per user) | `carts.user_id` (UNIQUE); `cart_items(cart_id, listing_id, quantity)` |
| `orders` | An order (written server-side only, after payment) | `buyer_id`, `status`, `subtotal_cents`/`tax_cents`/`shipping_cents`/`total_cents`, `stripe_payment_intent_id`, `shipping_address_id` |
| `order_items` | Line items, with title/edition text snapshotted | `order_id`, `listing_id`, `unit_price_cents`, `quantity`, `title_snapshot` |
| `shipping_addresses` | Buyer addresses (CA) | `user_id`, `line1`, `city`, `province`, `postal_code` |
| `tax_rates` | Combined CA sales-tax reference (13 provinces) | `province` (PK), `rate` (fraction) — **verify against CRA before go-live** |

**RLS:** `product_editions` / `listings` (active) / `tax_rates` are public-read; `carts` / `cart_items` / `shipping_addresses` / `orders` / `order_items` are owner-only. **`orders` has no client write grant** — created by the service role after payment. Money math lives in `lib/commerce.ts` (unit-tested).

**Note for Phase P4 (marketplace):** `product_editions` has no INSERT policy/grant for `authenticated` — only `listings` has the seller hook. A P2P seller can list an *existing* catalog edition but can't add a new one yet; P4 needs an admin-curation flow or an expanded grant on `product_editions`.

---

## RPC Functions

### `match_titles`
Semantic similarity search via pgvector.

```sql
match_titles(
  query_embedding vector(1536),
  match_threshold float,  -- minimum similarity (0.0–1.0)
  match_count     int,    -- max results
  p_media_type    text    -- "movie" | "tv" | null
)
RETURNS TABLE (title_id text, similarity float)
```

### `browse_titles`
Filtered title browsing with pagination and trigger warning filtering (v6.5+).

```sql
browse_titles(
  p_media_type              text    DEFAULT NULL,
  p_genre_ids               int[]   DEFAULT NULL,
  p_min_rating              float   DEFAULT 0,
  p_year_from               int     DEFAULT NULL,
  p_year_to                 int     DEFAULT NULL,
  p_country                 text    DEFAULT NULL,
  p_cvrs                    text    DEFAULT NULL,
  p_language                text    DEFAULT NULL,
  p_runtime_min             int     DEFAULT NULL,
  p_runtime_max             int     DEFAULT NULL,
  p_platform_ids            int[]   DEFAULT NULL,
  p_limit                   int     DEFAULT 40,
  p_offset                  int     DEFAULT 0,
  p_user_id                 uuid    DEFAULT NULL,
  p_filter_hidden_triggers  boolean DEFAULT false
)
RETURNS TABLE (id, title, overview, poster_path, backdrop_path, release_date,
               vote_average, media_type, popularity, runtime, origin_country,
               certification_ca, original_language)
```

**Parameters (v6.5 additions):**
- `p_user_id` — User ID for trigger filtering (NULL = no filtering)
- `p_filter_hidden_triggers` — Enable/disable trigger filtering (default false)

**Behavior:**
- When `p_filter_hidden_triggers = true` AND `p_user_id` is provided, excludes titles with user's hidden triggers
- Backward compatible — filtering disabled by default for existing code

### `get_for_you_feed`
Personalized recommendations based on watch history and friend activity.

```sql
get_for_you_feed(
  p_user_id uuid,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (... Title fields ..., match_pct float, friend_count int, friend_avatars text[])
```

---

## Row-Level Security (RLS) Summary

| Table | Read | Write |
|-------|------|-------|
| `titles` | Public | Authenticated (insert only) |
| `title_embeddings` | Public | Authenticated (insert only) |
| `genres`, `title_genres` | Public | Authenticated |
| `profiles` | Public | Owner only |
| `watch_history` | Owner only | Owner only |
| `custom_lists` | Owner + members + public (if `is_public`) | Owner only |
| `list_items` | Owner + members + public (if list is public) | Owner + editors |
| `list_members` | Owner + members | Owner only |
| `messages` | Sender + receiver | Sender only |
| `dtdd_cache` | Public | Service role only (from edge function) |
| `user_trigger_prefs` | Owner only | Owner only |
| `title_streaming_platforms`, `streaming_platforms` | Public | Authenticated (insert only) |

---

## Migration History

All migrations are in `supabase/migrations/`. Applied in timestamp order.

| File | Purpose |
|------|---------|
| `20260416000000` | Base title columns |
| `20260416000001–5` | Detail columns, awards, watch providers, device auth |
| `20260417000001–4` | Profile setup, not-interested status, partner sync, content sync |
| `20260418000001–3` | Community ratings, watchlists, trigger warnings |
| `20260424000001` | browse_titles RPC + runtime filtering |
| `20260424000003` | Friends system (follows, friend_requests) |
| `20260504000001` | Social RPCs (get_for_you_feed, trending, notifications) |
| `20260508` | Catalog seeding cron |
| `20260509` | Embedding backfill |
| `20260510000001` | Messages & conversation RPCs |
| `20260515000001` | Updated browse_titles (platform filtering) |
| `20260515000002` | Security hardening (messages RLS, anon revocation) |
| `20260515000003` | Performance indexes |
| `20260515000004` | Input validation (avatar_url CHECK, message length) |
| `20260515000005` | Performance refinement (follows, profiles indexes) |
| `20260515000006` | for_you CTE optimization |
| `20260516000001` | for_you feed optimization (NOT EXISTS rewrite) |
| `20260520000001` | Keyword search RPC (initial version) |
| `20260521190000` | Keyword search RPC fix (added GIN index, schema reload) |
| `20260521200000` | Keyword search OR-matching (compound query support) |
| `20260521210000` | Keyword search type fix (::float cast for vote_average) |
| `20260522000001` | Trigger warning filtering (browse_titles extension) |

---

## Useful Diagnostic Queries

```sql
-- Recent titles without embeddings (need backfill)
SELECT t.id, t.title, t.cached_at
FROM titles t
LEFT JOIN title_embeddings te ON t.id = te.title_id
WHERE te.title_id IS NULL
ORDER BY t.cached_at DESC
LIMIT 20;

-- Watch history counts per user
SELECT user_id, COUNT(*) as entries,
  COUNT(*) FILTER (WHERE status = 'watched') as watched,
  COUNT(*) FILTER (WHERE status = 'want_to_watch') as want
FROM watch_history
GROUP BY user_id
ORDER BY watched DESC;

-- Most popular titles in catalog
SELECT title, media_type, vote_average, popularity
FROM titles
ORDER BY popularity DESC
LIMIT 20;

-- Embedding coverage
SELECT
  COUNT(*) as total_titles,
  COUNT(te.title_id) as with_embedding,
  ROUND(COUNT(te.title_id)::numeric / COUNT(*) * 100, 1) as coverage_pct
FROM titles t
LEFT JOIN title_embeddings te ON t.id = te.title_id;
```
