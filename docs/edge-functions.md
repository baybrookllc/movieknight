# StreamSocial — Edge Functions Reference

All edge functions are deployed on Supabase (Deno runtime) and accessible at:
`https://nwvliipxqedueskhxdym.supabase.co/functions/v1/<function-name>`

CORS is configured to allow requests from `movieknight.ca`, Vercel preview URLs, and localhost.

---

## `tmdb-cache`

TMDB API proxy with intelligent caching. The app never calls TMDB directly.

**Base URL:** `.../functions/v1/tmdb-cache`

### Actions

#### `search` — Search titles
```
GET ?action=search&query=inception&type=movie
```
| Param | Type | Notes |
|-------|------|-------|
| `query` | string | Search term |
| `type` | string | `movie` \| `tv` (optional) |

Returns: `{ results: [Title, ...] }`

Side effect: Fetches full detail for each new result (runtime, CVRS, language, country).

#### `detail` — Fetch full title details
```
GET ?action=detail&tmdb_id=550&media_type=movie
```
| Param | Type | Notes |
|-------|------|-------|
| `tmdb_id` | integer | |
| `media_type` | string | `movie` \| `tv` |
| `force` | boolean | Bypass cache (service-role only) |

Returns: `{ title: Title }`

Caching: <7 days → return from DB. >7 days → re-fetch.

#### `discover` — Seed popular titles
```
GET ?action=discover&media_type=movie&pages=20
```
| Param | Type | Notes |
|-------|------|-------|
| `media_type` | string | `movie` \| `tv` |
| `pages` | integer | Max 25 (service-role). Anon capped at 5. |

Returns: `{ seeded: number, skipped: number }`

---

## `semantic-search`

Converts a natural language query to a vector and returns ranked title matches.

**Base URL:** `.../functions/v1/semantic-search`

```
GET ?query=mind-bending+sci-fi+thriller&limit=10&media_type=movie
```

| Param | Type | Notes |
|-------|------|-------|
| `query` | string | Natural language query |
| `limit` | integer | Max 50, default 10 |
| `media_type` | string | `movie` \| `tv` (optional) |

**Response:**
```json
{
  "results": [
    {
      "id": "movie:550",
      "title": "Fight Club",
      "overview": "...",
      "poster_path": "/...",
      "media_type": "movie",
      "release_date": "1999-10-15",
      "vote_average": 8.4,
      "similarity": 0.87
    }
  ]
}
```

**Rate limit:** 60 req/min per IP

---

## `generate-embedding`

Generates vector embeddings for titles using OpenAI.

**Base URL:** `.../functions/v1/generate-embedding`

### Single title
```
POST { "title_id": "movie:550" }
```

### Batch titles
```
POST { "title_ids": ["movie:550", "tv:1396", ...] }
```
Batch capped at 100. Service-role only for batches.

### Backfill all missing
```
POST { "backfill": true, "limit": 100 }
```
Service-role required. Processes titles with no embedding.

**Response:**
```json
{
  "embedded": ["movie:550", "tv:1396"],
  "skipped": [],
  "errors": []
}
```

**DB Webhook:** This function is called automatically by the `titles` INSERT webhook. Requires `Authorization: Bearer <EMBED_WEBHOOK_SECRET>` header.

---

## `tv-seasons`

Returns season and episode data for a TV show.

**Base URL:** `.../functions/v1/tv-seasons`

```
GET ?tmdb_id=1396
```

**Response:**
```json
{
  "seasons": [
    {
      "season_number": 1,
      "name": "Season 1",
      "episode_count": 7,
      "episodes": [
        { "episode_number": 1, "name": "Pilot" },
        ...
      ]
    }
  ]
}
```

---

## `dtdd-fetch`

Caching proxy for DoesTheDogDie.com content warnings API.

**Base URL:** `.../functions/v1/dtdd-fetch`

```
POST { "title_ids": ["movie:550", "movie:680"] }
```

Batch capped at 10 titles. 30-day cache TTL.

**Response:**
```json
{
  "results": {
    "movie:550": [
      { "topic": "dog", "flag": true, "confidence": 0.92 },
      { "topic": "suicide", "flag": true, "confidence": 0.78 }
    ],
    "movie:680": []
  }
}
```

Confidence threshold: ≥ 70% (yesSum / (yesSum + noSum)).

---

## `delete-account`

Deletes all user data and removes auth account. GDPR-compliant cleanup.

**Base URL:** `.../functions/v1/delete-account`

```
POST {}
Authorization: Bearer <user-JWT>
```

Deletes: `watch_history`, `custom_lists`, `list_items`, `list_members`, `messages`, `profiles`, `auth.users`.

---

## `tv-auth`

Enables TV/device login via QR code flow.

**Base URL:** `.../functions/v1/tv-auth`

### Step 1 — Request device code
```
POST { "action": "request" }
```
Returns: `{ device_code, user_code, expires_at }`

### Step 2 — Poll for authentication
```
POST { "action": "poll", "device_code": "..." }
```
Returns: `{ status: "pending" | "authenticated", access_token? }`

### Step 3 — Authenticate (from browser)
```
POST { "action": "authenticate", "user_code": "XXXX-XXXX" }
Authorization: Bearer <user-JWT>
```

---

## Deploying / Updating Functions

```bash
# Deploy all functions
supabase functions deploy --project-ref nwvliipxqedueskhxdym

# Deploy single function
supabase functions deploy semantic-search --project-ref nwvliipxqedueskhxdym

# View logs
supabase functions logs semantic-search --project-ref nwvliipxqedueskhxdym

# View all function logs (last 100)
supabase functions logs --project-ref nwvliipxqedueskhxdym
```

## Required Secrets

Set via `supabase secrets set KEY=value --project-ref nwvliipxqedueskhxdym`

| Secret | Used By |
|--------|---------|
| `TMDB_API_KEY` | tmdb-cache |
| `OPENAI_API_KEY` | semantic-search, generate-embedding |
| `DTDD_API_KEY` | dtdd-fetch |
| `EMBED_WEBHOOK_SECRET` | generate-embedding (DB webhook auth) |
