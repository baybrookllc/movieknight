// ============================================================
//  MovieKnight — TMDB Cache Edge Function
//  File: supabase/functions/tmdb-cache/index.ts
//
//  HOW IT WORKS:
//  1. App calls this function with a search query OR a tmdb_id + media_type
//  2. Function checks Supabase titles table first (cache)
//  3. If not cached (or cache is stale), fetches from TMDB
//  4. Writes result to titles + title_genres tables
//  5. Returns the data to the app
//
//  DEPLOY COMMAND (run in your terminal):
//  supabase functions deploy tmdb-cache
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCors } from "../_shared/cors-utils.ts";

// ── Types ────────────────────────────────────────────────────

interface TMDBSearchResult {
  id: number;
  title?: string;        // movies
  name?: string;         // tv shows
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string; // movies
  first_air_date?: string; // tv shows
  vote_average: number;
  popularity: number;
  genre_ids: number[];
  media_type?: string;
  runtime?: number;
  episode_run_time?: number[];
  original_language?: string;
  origin_country?: string[];
  production_countries?: { iso_3166_1: string; name: string }[];
}

interface TMDBDetailResult extends TMDBSearchResult {
  genres: { id: number; name: string }[];
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string; type: number; release_date: string }[] }[] };
  budget?: number;
  revenue?: number;
  production_companies?: { id: number; name: string; logo_path: string | null; origin_country: string }[];
  spoken_languages?: { iso_639_1: string; name: string; english_name: string }[];
  credits?: {
    crew: { id: number; name: string; job: string; department: string }[];
    cast: { id: number; name: string; character: string; order: number }[];
  };
  created_by?: { id: number; name: string }[];
}

interface CachedTitle {
  id: string;
  tmdb_id: number;
  media_type: string;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  vote_average: number;
  popularity: number;
  cached_at: string;
  runtime: number | null;
  original_language: string | null;
  origin_country: string | null;
  certification_ca: string | null;
}

// ── Constants ────────────────────────────────────────────────

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const CACHE_TTL_DAYS = 7;

// ── Fetch with timeout ───────────────────────────────────
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns true if the request carries a real user JWT (not the anon key).
 * Used to guard admin-only params like force=true.
 */
function isAuthenticated(req: Request): boolean {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  return !!auth && auth !== `Bearer ${anonKey}`;
}

// ── Rate limiting (per-isolate, in-memory) ──────────────────
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(req: Request, action: string, max: number, windowMs: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  const key = `${ip}:${action}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}


// Caps per action — generous for legitimate use, tight for abuse
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  search:          { max: 60,  windowMs: 60_000 },  // 1/sec avg
  detail:          { max: 60,  windowMs: 60_000 },
  videos:          { max: 60,  windowMs: 60_000 },
  awards:          { max: 30,  windowMs: 60_000 },  // expensive (Wikidata)
  "watch-providers": { max: 60, windowMs: 60_000 },
  upcoming:        { max: 30,  windowMs: 60_000 },
  discover:        { max: 5,   windowMs: 60_000 },  // very expensive (≥125 TMDB calls/req)
  "sync-new":      { max: 5,   windowMs: 60_000 },
  "genres-sync":   { max: 2,   windowMs: 60_000 },  // admin-ish
};

// ── Per-request CORS (module-level, set at start of each request) ────────────
let _reqCors: Record<string, string> = {};

// ── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  _reqCors = makeCors(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: _reqCors });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── Rate limit per action ─────────────────────────────────
    const limit = action ? RATE_LIMITS[action] : null;
    if (limit && !checkRateLimit(req, action!, limit.max, limit.windowMs)) {
      return new Response(
        JSON.stringify({ error: "Too many requests" }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60", ..._reqCors } }
      );
    }

    // ── Supabase client (uses service role for cache writes) ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tmdbApiKey = Deno.env.get("TMDB_API_KEY")!;

    // ── Route to correct handler ──────────────────────────────
    switch (action) {
      case "search":
        return await handleSearch(req, supabase, tmdbApiKey);
      case "detail":
        return await handleDetail(req, supabase, tmdbApiKey);
      case "genres-sync":
        return await handleGenreSync(supabase, tmdbApiKey);
      case "discover":
        return await handleDiscover(req, supabase, tmdbApiKey);
      case "awards":
        return await handleAwards(req, supabase, tmdbApiKey);
      case "watch-providers":
        return await handleWatchProviders(req, supabase, tmdbApiKey);
      case "videos":
        return await handleVideos(req, supabase, tmdbApiKey);
      case "upcoming":
        return await handleUpcoming(req, supabase, tmdbApiKey);
      case "sync-new":
        return await handleSyncNew(supabase, tmdbApiKey);
      default:
        return errorResponse("Invalid action. Use: search | detail | genres-sync | discover | awards | watch-providers | videos | upcoming | sync-new", 400);
    }
  } catch (err) {
    console.error("Edge function error:", err);
    return errorResponse("Internal server error", 500);
  }
});

// ── HANDLER: Search ──────────────────────────────────────────
//
//  GET ?action=search&query=breaking+bad&type=tv
//  GET ?action=search&query=inception&type=movie
//  GET ?action=search&query=inception          (searches both)
//
async function handleSearch(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query");
  const type  = url.searchParams.get("type"); // "movie" | "tv" | null (both)

  if (!query) return errorResponse("query param is required", 400);

  // Determine which TMDB endpoint to use
  const endpoint = type === "movie"
    ? `/search/movie`
    : type === "tv"
    ? `/search/tv`
    : `/search/multi`; // returns both movies and TV

  const tmdbUrl = `${TMDB_BASE_URL}${endpoint}?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&include_adult=false`;
  const tmdbRes = await fetchWithTimeout(tmdbUrl);

  if (!tmdbRes.ok) {
    return errorResponse(`TMDB search failed: ${tmdbRes.status}`, 502);
  }

  const tmdbData = await tmdbRes.json();
  const results: TMDBSearchResult[] = tmdbData.results ?? [];

  // Filter out person results — typed endpoints never return them; multi-search can
  const titlesOnly = results.filter(r => r.media_type !== "person");

  // Cache results in the background (don't await — return fast)
  cacheTitlesInBackground(titlesOnly, type, supabase, tmdbApiKey);

  // Return formatted results immediately from TMDB data
  const formatted = titlesOnly.map((r) => formatTitle(r, type));

  return jsonResponse({ results: formatted, source: "tmdb" });
}

// ── HANDLER: Detail ──────────────────────────────────────────
//
//  GET ?action=detail&tmdb_id=1396&media_type=tv
//  GET ?action=detail&tmdb_id=550&media_type=movie
//
async function handleDetail(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const url        = new URL(req.url);
  const tmdbId     = url.searchParams.get("tmdb_id");
  const mediaType  = url.searchParams.get("media_type");
  const forceRefresh = url.searchParams.get("force") === "true";

  if (!tmdbId || !mediaType) {
    return errorResponse("tmdb_id and media_type params are required", 400);
  }

  if (forceRefresh && !isAuthenticated(req)) {
    return errorResponse("force=true requires an authenticated user session", 401);
  }

  const titleId = `${mediaType}:${tmdbId}`;

  // ── 1. Check cache first ──────────────────────────────────
  const { data: cached } = await supabase
    .from("titles")
    .select("*")
    .eq("id", titleId)
    .single();

  // Movies need theatrical data; if both columns are null it means this title
  // was cached before theatrical extraction was added — treat as a cache miss
  // so it gets re-fetched once.  After that, theatrical_ca/us will be a date
  // string or the sentinel "none", so this bypass won't fire again.
  const needsTheatricalSync =
    cached?.media_type === "movie" &&
    cached?.theatrical_ca == null &&
    cached?.theatrical_us == null;

  if (cached && !isCacheStale(cached.cached_at, cached.release_date) && !forceRefresh && !needsTheatricalSync) {
    // Fetch genres for this title too
    const { data: genres } = await supabase
      .from("title_genres")
      .select("genre_id, genres(name)")
      .eq("title_id", titleId);

    return jsonResponse({ ...cached, genres: genres ?? [], source: "cache" });
  }

  // ── 2. Fetch from TMDB ────────────────────────────────────
  const tmdbUrl = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${tmdbApiKey}&append_to_response=credits,content_ratings,release_dates`;
  const tmdbRes = await fetchWithTimeout(tmdbUrl);

  if (!tmdbRes.ok) {
    return errorResponse(`TMDB fetch failed: ${tmdbRes.status}`, 502);
  }

  const detail: TMDBDetailResult = await tmdbRes.json();

  // ── 3. Upsert into cache ──────────────────────────────────
  const titleRow = buildTitleRow(detail, mediaType);
  await supabase.from("titles").upsert(titleRow, { onConflict: "id" });

  // Upsert genres
  if (detail.genres?.length) {
    const genreRows = detail.genres.map((g) => ({
      title_id: titleId,
      genre_id: g.id,
    }));
    await supabase
      .from("title_genres")
      .upsert(genreRows, { onConflict: "title_id,genre_id" });
  }

  return jsonResponse({ ...titleRow, genres: detail.genres ?? [], source: "tmdb" });
}

// ── HANDLER: Discover ────────────────────────────────────────
//
//  GET ?action=discover&media_type=movie&pages=5
//  GET ?action=discover&media_type=tv&pages=3
//  Fetches N pages of popular titles from TMDB, then hydrates each
//  with the full detail endpoint so runtime/CVRS/language are populated.
//
// ── Known major studio TMDB company IDs ─────────────────────
const STUDIO_IDS: Record<string, number> = {
  "disney":          2,
  "pixar":           3,
  "paramount":       4,
  "sony":            5,
  "columbia":        5,
  "dreamworks":      521,
  "universal":       33,
  "warner":          174,
  "warnerbros":      174,
  "fox":             25,
  "20thcentury":     25,
  "newline":         12,
  "lionsgate":       1632,
  "mgm":             8411,
  "a24":             41077,
  "netflix":         213,
  "amazon":          21,
  "apple":           2739,
  "marvel":          420,
  "lucasfilm":       1,
  "amblin":          56,
  "miramax":         14,
  "focus":           10146,
  "searchlight":     444,
  "blumhouse":       3172,
  "annapurna":       59436,
  "neon":            182212,
};

async function handleDiscover(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const url       = new URL(req.url);
  const mediaType = url.searchParams.get("media_type") === "tv" ? "tv" : "movie";
  // Service-role callers (cron seed job) can do bigger discovers; anon clients capped to 5 pages
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isServiceRole = serviceKey && req.headers.get("Authorization") === `Bearer ${serviceKey}`;
  const maxPages  = isServiceRole ? 25 : 5;
  const pages     = Math.min(parseInt(url.searchParams.get("pages") ?? "5"), maxPages);
  const pageFrom  = Math.max(1, parseInt(url.searchParams.get("page_from") ?? "1"));
  const withCountry   = url.searchParams.get("with_origin_country") ?? "";
  // Accept either a numeric company ID or a known studio name
  const studioParam   = url.searchParams.get("with_companies") ?? "";
  const studioId      = studioParam
    ? (STUDIO_IDS[studioParam.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? parseInt(studioParam) ?? 0)
    : 0;

  // Step 1: collect all tmdb_ids from discover pages — fetch all pages in parallel
  const countryParam = withCountry ? `&with_origin_country=${encodeURIComponent(withCountry)}` : "";
  const companyParam = studioId    ? `&with_companies=${studioId}` : "";
  const pageUrls = Array.from({ length: pages }, (_, i) => {
    const page = pageFrom + i;
    return `${TMDB_BASE_URL}/discover/${mediaType}?api_key=${tmdbApiKey}&sort_by=popularity.desc&page=${page}&include_adult=false&language=en-US${countryParam}${companyParam}`;
  });

  const pageResults = await Promise.allSettled(pageUrls.map(url => fetchWithTimeout(url).then(r => r.ok ? r.json() : null)));
  const discovered: { id: number; genre_ids: number[] }[] = [];
  for (const result of pageResults) {
    if (result.status === "fulfilled" && result.value?.results) {
      for (const r of result.value.results) {
        discovered.push({ id: r.id, genre_ids: r.genre_ids ?? [] });
      }
    }
  }

  // Step 2: fetch full details in parallel batches of 5
  let seeded = 0; let errors = 0;
  const BATCH = 5;
  for (let i = 0; i < discovered.length; i += BATCH) {
    const batch = discovered.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async ({ id, genre_ids }) => {
        try {
          const detailUrl = `${TMDB_BASE_URL}/${mediaType}/${id}?api_key=${tmdbApiKey}&append_to_response=credits,content_ratings,release_dates`;
          const detailRes = await fetchWithTimeout(detailUrl);
          if (!detailRes.ok) { errors++; return; }
          const detail: TMDBDetailResult = await detailRes.json();
          const row = buildTitleRow(detail, mediaType);
          await supabase.from("titles").upsert(row, { onConflict: "id" });
          const genreIds = detail.genres?.map(g => g.id) ?? genre_ids;
          if (genreIds.length) {
            const genreRows = genreIds.map((gid) => ({ title_id: row.id, genre_id: gid }));
            await supabase.from("title_genres").upsert(genreRows, { onConflict: "title_id,genre_id" });
          }
          seeded++;
        } catch { errors++; }
      })
    );
    // Small pause between batches to respect TMDB rate limits
    if (i + BATCH < discovered.length) await new Promise(r => setTimeout(r, 150));
  }

  return jsonResponse({ seeded, errors, media_type: mediaType, pages, studio: studioId || null });
}

// ── HANDLER: Genre Sync ──────────────────────────────────────
//
//  GET ?action=genres-sync
//  Run this ONCE after deploying to populate your genres table.
//  You can also call it periodically to pick up new TMDB genres.
//
async function handleGenreSync(
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const [movieGenres, tvGenres] = await Promise.all([
    fetchWithTimeout(`${TMDB_BASE_URL}/genre/movie/list?api_key=${tmdbApiKey}`).then((r) => r.json()),
    fetchWithTimeout(`${TMDB_BASE_URL}/genre/tv/list?api_key=${tmdbApiKey}`).then((r) => r.json()),
  ]);

  // Merge and deduplicate (many genres appear in both)
  const allGenres: { id: number; name: string }[] = [
    ...(movieGenres.genres ?? []),
    ...(tvGenres.genres ?? []),
  ];

  const unique = Array.from(
    new Map(allGenres.map((g) => [g.id, g])).values()
  );

  const { error } = await supabase
    .from("genres")
    .upsert(unique, { onConflict: "id" });

  if (error) return errorResponse(`Genre sync failed: ${error.message}`, 500);

  return jsonResponse({ synced: unique.length, genres: unique });
}

// ── HANDLER: Awards ──────────────────────────────────────────
//
//  GET ?action=awards&tmdb_id=550&media_type=movie
//  Returns structured awards data from Wikidata, cached in titles.awards_json.
//
async function handleAwards(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const url        = new URL(req.url);
  const tmdbId     = url.searchParams.get("tmdb_id");
  const mediaType  = url.searchParams.get("media_type") ?? "movie";
  const force      = url.searchParams.get("force") === "true";

  if (!tmdbId) return errorResponse("tmdb_id is required", 400);
  if (force && !isAuthenticated(req)) {
    return errorResponse("force=true requires an authenticated user session", 401);
  }

  const titleId = `${mediaType}:${tmdbId}`;

  // ── 1. Return from cache if fresh (≤30 days) ─────────────
  if (!force) {
    const { data: cached } = await supabase
      .from("titles")
      .select("awards_json")
      .eq("id", titleId)
      .single();

    if (cached?.awards_json) {
      const age = Date.now() - new Date(cached.awards_json.fetched_at ?? 0).getTime();
      if (age < 30 * 24 * 60 * 60 * 1000) {
        return jsonResponse(cached.awards_json);
      }
    }
  }

  // ── 2. Get IMDb ID from TMDB external_ids ─────────────────
  const extRes = await fetchWithTimeout(
    `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/external_ids?api_key=${tmdbApiKey}`
  );
  if (!extRes.ok) {
    // Cache the empty result so we don't re-hit TMDB on every detail open
    const empty = emptyAwards(titleId);
    await supabase.from("titles").update({ awards_json: empty }).eq("id", titleId);
    return jsonResponse(empty);
  }
  const extData = await extRes.json();
  const imdbId: string | null = extData.imdb_id ?? null;
  if (!imdbId) {
    const empty = emptyAwards(titleId);
    await supabase.from("titles").update({ awards_json: empty }).eq("id", titleId);
    return jsonResponse(empty);
  }

  // ── 3. Query Wikidata for won (P166) and nominated (P1411) ─
  const SPARQL = "https://query.wikidata.org/sparql";
  const headers = {
    "Accept": "application/sparql-results+json",
    "User-Agent": "MovieKnight/1.0 (https://movieknight.ca)",
  };

  function buildQuery(prop: string) {
    return `SELECT DISTINCT ?awardLabel ?seriesLabel ?recipientLabel (YEAR(?date) AS ?yr) WHERE {
      ?work wdt:P345 "${imdbId}" .
      ?work p:${prop} ?stmt .
      ?stmt ps:${prop} ?award .
      ?award rdfs:label ?awardLabel FILTER(LANG(?awardLabel)="en") .
      OPTIONAL { ?award wdt:P179 ?series . ?series rdfs:label ?seriesLabel FILTER(LANG(?seriesLabel)="en") . }
      OPTIONAL { ?stmt pq:P1027 ?recip . ?recip rdfs:label ?recipientLabel FILTER(LANG(?recipientLabel)="en") . }
      OPTIONAL { ?stmt pq:P585 ?date . }
    } LIMIT 150`;
  }

  const [wonRes, nomRes] = await Promise.all([
    fetchWithTimeout(`${SPARQL}?format=json&query=${encodeURIComponent(buildQuery("P166"))}`, 15000).then(r => new Response(r.body, { status: r.status, headers: r.headers })).catch(() => new Response('', { status: 500 })),
    fetchWithTimeout(`${SPARQL}?format=json&query=${encodeURIComponent(buildQuery("P1411"))}`, 15000).then(r => new Response(r.body, { status: r.status, headers: r.headers })).catch(() => new Response('', { status: 500 })),
  ]);

  // ── 4. Parse results into category buckets ────────────────
  type AwardRow = { series: string; name: string; recipient?: string; year?: number; won: boolean };
  const rows: AwardRow[] = [];

  function inferSeries(label: string): string {
    const l = label.toLowerCase();
    if (l.includes("academy award") || l.includes("oscar")) return "Academy Awards";
    if (l.includes("bafta") || l.includes("british academy")) return "BAFTA Awards";
    if (l.includes("golden globe")) return "Golden Globe Awards";
    if (l.includes("screen actors guild") || l.includes("sag award")) return "Screen Actors Guild Awards";
    if (l.includes("emmy")) return "Emmy Awards";
    if (l.includes("grammy")) return "Grammy Awards";
    if (l.includes("tony")) return "Tony Awards";
    if (l.includes("saturn award")) return "Saturn Awards";
    if (l.includes("critics' choice") || l.includes("critics choice")) return "Critics' Choice Awards";
    if (l.includes("directors guild") || l.includes("dga award")) return "Directors Guild Awards";
    if (l.includes("writers guild") || l.includes("wga award")) return "Writers Guild Awards";
    if (l.includes("producers guild") || l.includes("pga award")) return "Producers Guild Awards";
    if (l.includes("independent spirit") || l.includes("spirit award")) return "Film Independent Spirit Awards";
    if (l.includes("palme d") || l.includes("cannes")) return "Cannes Film Festival";
    if (l.includes("golden lion") || l.includes("venice")) return "Venice Film Festival";
    if (l.includes("golden bear") || l.includes("berlin")) return "Berlin International Film Festival";
    if (l.includes("sundance")) return "Sundance Film Festival";
    if (l.includes("golden raspberry") || l.includes("razzie")) return "Razzie Awards";
    return "Other Awards";
  }

  async function parseBindings(res: Response, won: boolean) {
    if (!res.ok) return;
    const data = await res.json();
    for (const b of data.results?.bindings ?? []) {
      const awardLabel = b.awardLabel?.value ?? "Award";
      rows.push({
        series:    b.seriesLabel?.value ?? inferSeries(awardLabel),
        name:      awardLabel,
        recipient: b.recipientLabel?.value ?? undefined,
        year:      b.yr?.value ? parseInt(b.yr.value) : undefined,
        won,
      });
    }
  }

  await Promise.all([parseBindings(wonRes, true), parseBindings(nomRes, false)]);

  // Group by series
  const byCategory: Record<string, { wins: AwardRow[]; nominations: AwardRow[] }> = {};
  for (const row of rows) {
    if (!byCategory[row.series]) byCategory[row.series] = { wins: [], nominations: [] };
    (row.won ? byCategory[row.series].wins : byCategory[row.series].nominations).push(row);
  }

  // Sort categories: well-known ones first
  const PRIORITY = ["Academy Awards", "BAFTA Awards", "Golden Globe Awards",
    "Screen Actors Guild Awards", "Critics' Choice Movie Awards",
    "Emmy Awards", "Grammy Awards", "Tony Awards"];
  const categories = Object.entries(byCategory)
    .map(([name, { wins, nominations }]) => ({ name, wins, nominations }))
    .sort((a, b) => {
      const ai = PRIORITY.indexOf(a.name), bi = PRIORITY.indexOf(b.name);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

  const totalWins = rows.filter(r => r.won).length;
  const totalNoms = rows.filter(r => !r.won).length;

  const awardsJson = {
    title_id:           titleId,
    imdb_id:            imdbId,
    total_wins:         totalWins,
    total_nominations:  totalNoms,
    categories,
    fetched_at:         new Date().toISOString(),
  };

  // ── 5. Cache in DB ────────────────────────────────────────
  await supabase
    .from("titles")
    .update({ awards_json: awardsJson })
    .eq("id", titleId);

  return jsonResponse(awardsJson);
}

function emptyAwards(titleId: string) {
  return { title_id: titleId, total_wins: 0, total_nominations: 0, categories: [], fetched_at: new Date().toISOString() };
}

// ── HANDLER: Watch Providers ─────────────────────────────────
//
//  GET ?action=watch-providers&tmdb_id=550&media_type=movie
//  Returns CA + US streaming/rental/purchase availability.
//  Cached in titles.watch_providers_json for 7 days.
//
interface ProviderItem {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}
interface CountryProviders {
  flatrate?: ProviderItem[];
  rent?: ProviderItem[];
  buy?: ProviderItem[];
  link?: string;
}

async function handleWatchProviders(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const url       = new URL(req.url);
  const tmdbId    = url.searchParams.get("tmdb_id");
  const mediaType = url.searchParams.get("media_type") ?? "movie";
  const force     = url.searchParams.get("force") === "true";

  if (!tmdbId) return errorResponse("tmdb_id is required", 400);
  if (force && !isAuthenticated(req)) {
    return errorResponse("force=true requires an authenticated user session", 401);
  }

  const titleId = `${mediaType}:${tmdbId}`;

  // ── 1. Return from cache if fresh (≤7 days) ──────────────
  if (!force) {
    const { data: cached } = await supabase
      .from("titles")
      .select("watch_providers_json")
      .eq("id", titleId)
      .single();

    if (cached?.watch_providers_json) {
      const age = Date.now() - new Date(cached.watch_providers_json.fetched_at ?? 0).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return jsonResponse(cached.watch_providers_json);
      }
    }
  }

  // ── 2. Fetch from TMDB ────────────────────────────────────
  const tmdbRes = await fetchWithTimeout(
    `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/watch/providers?api_key=${tmdbApiKey}`
  );

  const empty = { title_id: titleId, countries: {}, fetched_at: new Date().toISOString() };
  if (!tmdbRes.ok) return jsonResponse(empty);

  const tmdbData = await tmdbRes.json();
  const results  = tmdbData.results ?? {};

  // ── 3. Extract CA and US, sorted by display_priority ─────
  const countries: Record<string, CountryProviders> = {};
  for (const cc of ["CA", "US"]) {
    const r = results[cc];
    if (!r) continue;
    const sort = (arr: ProviderItem[] = []) =>
      [...arr].sort((a, b) => a.display_priority - b.display_priority);
    countries[cc] = {
      flatrate: sort(r.flatrate),
      rent:     sort(r.rent),
      buy:      sort(r.buy),
      link:     r.link ?? null,
    };
  }

  const payload = { title_id: titleId, countries, fetched_at: new Date().toISOString() };

  // ── 4. Cache in DB ────────────────────────────────────────
  await supabase.from("titles").update({ watch_providers_json: payload }).eq("id", titleId);

  return jsonResponse(payload);
}

// ── HANDLER: Videos / Trailers ──────────────────────────────
//
// ── HANDLER: Upcoming ────────────────────────────────────────
//
//  GET ?action=upcoming&pages=3
//  Returns movies releasing soon, sorted by release date ascending.
//  Caches each title in the DB; re-fetches fresh from TMDB every time
//  (the upcoming list changes daily so no point caching the list itself).
//
async function handleUpcoming(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const url   = new URL(req.url);
  const pages = Math.min(parseInt(url.searchParams.get("pages") ?? "10"), 20);

  const today = new Date().toISOString().slice(0, 10);
  // Look ahead 6 months
  const future = new Date();
  future.setMonth(future.getMonth() + 6);
  const futureDate = future.toISOString().slice(0, 10);

  // Use discover/movie sorted by popularity so major upcoming releases
  // (e.g. blockbusters months away) surface before obscure films releasing
  // next week. Hundreds of micro-releases per week would fill all pages with
  // date-asc ordering before reaching notable films. We re-sort by date after.
  const baseParams = new URLSearchParams({
    api_key: tmdbApiKey,
    language: "en-US",
    sort_by: "popularity.desc",
    "primary_release_date.gte": today,
    "primary_release_date.lte": futureDate,
    with_original_language: "en",
    include_adult: "false",
    include_video: "false",
  });

  // First page to get total_pages
  const first = await fetchWithTimeout(`${TMDB_BASE_URL}/discover/movie?${baseParams}&page=1`)
    .then(r => r.ok ? r.json() : { results: [], total_pages: 1 })
    .catch(() => ({ results: [], total_pages: 1 }));

  const totalPages = Math.min(first.total_pages ?? 1, pages);

  // Fetch remaining pages in parallel
  const rest = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetchWithTimeout(`${TMDB_BASE_URL}/discover/movie?${baseParams}&page=${i + 2}`)
            .then(r => r.ok ? r.json() : { results: [] })
            .catch(() => ({ results: [] }))
        )
      )
    : [];

  // Merge and deduplicate
  const seen = new Set<number>();
  const upcoming: TMDBSearchResult[] = [];
  for (const page of [first, ...rest]) {
    for (const m of (page.results ?? []) as TMDBSearchResult[]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        upcoming.push({ ...m, media_type: "movie" });
      }
    }
  }
  // Already sorted by TMDB (primary_release_date.asc) but ensure it
  upcoming.sort((a, b) =>
    (a.release_date ?? "").localeCompare(b.release_date ?? "")
  );

  // Cache each title in the DB (fire-and-forget)
  cacheTitlesInBackground(upcoming, "movie", supabase, tmdbApiKey);

  return jsonResponse({ results: upcoming.map(m => formatTitle(m, "movie")) });
}

//  GET ?action=videos&tmdb_id=550&media_type=movie
//  Returns the best YouTube trailer for a title.
//  Cached in titles.trailers_json for 30 days.
//
async function handleVideos(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  const url       = new URL(req.url);
  const tmdbId    = url.searchParams.get("tmdb_id");
  const mediaType = url.searchParams.get("media_type") ?? "movie";

  if (!tmdbId) return errorResponse("tmdb_id is required", 400);

  const titleId = `${mediaType}:${tmdbId}`;

  // ── 1. Return from cache if fresh (≤30 days) ─────────────
  const { data: cached } = await supabase
    .from("titles")
    .select("trailers_json")
    .eq("id", titleId)
    .single();

  if (cached?.trailers_json) {
    const age = Date.now() - new Date(cached.trailers_json.fetched_at ?? 0).getTime();
    if (age < 30 * 24 * 60 * 60 * 1000) {
      return jsonResponse(cached.trailers_json);
    }
  }

  // ── 2. Fetch from TMDB ────────────────────────────────────
  const tmdbRes = await fetchWithTimeout(
    `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/videos?api_key=${tmdbApiKey}&language=en-US`
  );

  const empty = { title_id: titleId, trailer: null, fetched_at: new Date().toISOString() };
  if (!tmdbRes.ok) {
    await supabase.from("titles").update({ trailers_json: empty }).eq("id", titleId);
    return jsonResponse(empty);
  }

  const tmdbData = await tmdbRes.json();
  const videos: { key: string; name: string; site: string; type: string; official: boolean; published_at: string }[] =
    tmdbData.results ?? [];

  // Pick the best trailer: official YouTube trailers first, newest first
  const trailers = videos
    .filter(v => v.site === "YouTube" && v.type === "Trailer")
    .sort((a, b) => {
      if (a.official !== b.official) return a.official ? -1 : 1;
      return (b.published_at ?? "").localeCompare(a.published_at ?? "");
    });

  const best = trailers[0] ?? null;
  const trailer = best
    ? { key: best.key, name: best.name, published_at: best.published_at }
    : null;

  const payload = { title_id: titleId, trailer, fetched_at: new Date().toISOString() };

  // ── 3. Cache in DB ────────────────────────────────────────
  await supabase.from("titles").update({ trailers_json: payload }).eq("id", titleId);

  return jsonResponse(payload);
}

// ── HANDLER: Sync New Releases ───────────────────────────────
//
//  GET ?action=sync-new
//  Fetches titles from TMDB's "now playing", "upcoming", and
//  "on the air" endpoints — the ones most likely to surface
//  genuinely new content — and upserts any that aren't already
//  fresh in the cache.
//
//  Designed to be called by pg_cron on a schedule (e.g. 2×/week).
//  Skips titles already cached within the 7-day TTL so it only
//  ever processes what's actually new.
//
async function handleSyncNew(
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  // ── 1. Collect title IDs from five TMDB "new content" lists ──
  const sources = [
    { url: `${TMDB_BASE_URL}/movie/now_playing?api_key=${tmdbApiKey}&language=en-US&page=1`,   mediaType: "movie" },
    { url: `${TMDB_BASE_URL}/movie/now_playing?api_key=${tmdbApiKey}&language=en-US&page=2`,   mediaType: "movie" },
    { url: `${TMDB_BASE_URL}/movie/upcoming?api_key=${tmdbApiKey}&language=en-US&page=1`,      mediaType: "movie" },
    { url: `${TMDB_BASE_URL}/movie/upcoming?api_key=${tmdbApiKey}&language=en-US&page=2`,      mediaType: "movie" },
    { url: `${TMDB_BASE_URL}/tv/on_the_air?api_key=${tmdbApiKey}&language=en-US&page=1`,       mediaType: "tv"    },
    { url: `${TMDB_BASE_URL}/tv/on_the_air?api_key=${tmdbApiKey}&language=en-US&page=2`,       mediaType: "tv"    },
    { url: `${TMDB_BASE_URL}/tv/airing_today?api_key=${tmdbApiKey}&language=en-US&page=1`,     mediaType: "tv"    },
  ];

  const seen   = new Set<string>();
  const toCheck: { id: number; mediaType: string }[] = [];

  for (const { url, mediaType } of sources) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.results ?? []) {
        const key = `${mediaType}:${r.id}`;
        if (!seen.has(key)) { seen.add(key); toCheck.push({ id: r.id, mediaType }); }
      }
    } catch { /* skip failed endpoint */ }
  }

  // ── 2. Skip titles already fresh in DB ───────────────────────
  let skipped = 0;
  const toProcess: { id: number; mediaType: string }[] = [];

  if (toCheck.length > 0) {
    const ids = toCheck.map(t => `${t.mediaType}:${t.id}`);
    const { data: existing } = await supabase
      .from("titles")
      .select("id, cached_at, release_date")
      .in("id", ids);

    const freshSet = new Set(
      (existing ?? []).filter(r => !isCacheStale(r.cached_at, r.release_date)).map(r => r.id)
    );
    for (const t of toCheck) {
      const key = `${t.mediaType}:${t.id}`;
      if (freshSet.has(key)) { skipped++; } else { toProcess.push(t); }
    }
  }

  // ── 3. Hydrate each new title with full detail ────────────────
  let seeded = 0, errors = 0;
  const BATCH = 5;
  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async ({ id, mediaType }) => {
        try {
          const detailUrl = `${TMDB_BASE_URL}/${mediaType}/${id}?api_key=${tmdbApiKey}&append_to_response=credits,content_ratings,release_dates`;
          const detailRes = await fetchWithTimeout(detailUrl);
          if (!detailRes.ok) { errors++; return; }
          const detail: TMDBDetailResult = await detailRes.json();
          const row = buildTitleRow(detail, mediaType);
          await supabase.from("titles").upsert(row, { onConflict: "id" });
          if (detail.genres?.length) {
            const genreRows = detail.genres.map(g => ({ title_id: row.id, genre_id: g.id }));
            await supabase.from("title_genres").upsert(genreRows, { onConflict: "title_id,genre_id" });
          }
          seeded++;
        } catch { errors++; }
      })
    );
    // Respect TMDB rate limits between batches
    if (i + BATCH < toProcess.length) await new Promise(r => setTimeout(r, 200));
  }

  return jsonResponse({
    run_at:        new Date().toISOString(),
    total_checked: toCheck.length,
    seeded,
    skipped,
    errors,
  });
}

// ── HELPERS ──────────────────────────────────────────────────

function buildTitleRow(data: TMDBSearchResult | TMDBDetailResult, mediaType?: string) {
  const resolvedType = mediaType ?? data.media_type ?? "movie";

  // Runtime: movies have `runtime` (minutes), TV has `episode_run_time` array
  const runtime = data.runtime
    ?? (data.episode_run_time?.[0] ?? null);

  // Language: ISO 639-1 code e.g. "en", "fr", "ko"
  const originalLanguage = data.original_language ?? null;

  // Country: primary production country ISO code e.g. "US", "CA", "KR"
  // TV shows use `origin_country` array, movies use `production_countries`
  let originCountry: string | null = null;
  if (data.origin_country && data.origin_country.length > 0) {
    originCountry = data.origin_country[0];
  } else if ((data as TMDBDetailResult).production_countries && (data as TMDBDetailResult).production_countries!.length > 0) {
    originCountry = (data as TMDBDetailResult).production_countries![0].iso_3166_1;
  }

  // Canadian certification
  // For TV: content_ratings.results → find CA
  // For movies: release_dates.results → find CA → first certification
  let certificationCa: string | null = null;
  const detail = data as TMDBDetailResult;
  if (detail.content_ratings?.results) {
    const ca = detail.content_ratings.results.find(r => r.iso_3166_1 === "CA");
    if (ca) certificationCa = ca.rating || null;
  }
  if (!certificationCa && detail.release_dates?.results) {
    const ca = detail.release_dates.results.find(r => r.iso_3166_1 === "CA");
    if (ca && ca.release_dates.length > 0) {
      certificationCa = ca.release_dates.find(rd => rd.certification)?.certification ?? null;
    }
  }

  // Theatrical release dates: type 2 (limited) or type 3 (wide theatrical)
  let theatricalCa: string | null = null;
  let theatricalUs: string | null = null;
  if (detail.release_dates?.results) {
    for (const country of detail.release_dates.results) {
      const theatrical = country.release_dates
        .filter(rd => rd.type === 2 || rd.type === 3)
        .sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""))[0];
      if (!theatrical?.release_date) continue;
      const dateStr = theatrical.release_date.slice(0, 10);
      if (country.iso_3166_1 === "CA" && !theatricalCa) theatricalCa = dateStr;
      if (country.iso_3166_1 === "US" && !theatricalUs) theatricalUs = dateStr;
    }
  }

  // Studios: top 3 production companies
  const studios = detail.production_companies?.slice(0, 3).map(c => c.name) ?? null;

  // Spoken languages: english names
  const spokenLanguages = detail.spoken_languages?.map(l => l.english_name).filter(Boolean) ?? null;

  // Directors from crew
  const directors = detail.credits?.crew
    ?.filter(c => c.job === "Director")
    .map(c => c.name) ?? null;

  // Writers: Writer / Screenplay / Story credits, deduplicated, max 5
  const writerJobs = new Set(["Writer", "Screenplay", "Story", "Teleplay"]);
  const writers = detail.credits?.crew
    ?.filter(c => writerJobs.has(c.job))
    .map(c => c.name)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 5) ?? null;

  // TV shows: also include created_by as directors if no crew directors
  const finalDirectors = (directors && directors.length > 0)
    ? directors
    : (detail.created_by?.map(c => c.name) ?? null);

  // Budget & revenue (movies only; TV returns 0 or undefined)
  const budget  = (detail.budget  && detail.budget  > 0) ? detail.budget  : null;
  const revenue = (detail.revenue && detail.revenue > 0) ? detail.revenue : null;

  return {
    id:               `${resolvedType}:${data.id}`,
    tmdb_id:          data.id,
    media_type:       resolvedType,
    title:            data.title ?? data.name ?? "Unknown",
    overview:         data.overview ?? "",
    poster_path:      data.poster_path ?? null,
    backdrop_path:    data.backdrop_path ?? null,
    release_date:     data.release_date ?? data.first_air_date ?? null,
    vote_average:     data.vote_average ?? 0,
    popularity:       data.popularity ?? 0,
    cached_at:        new Date().toISOString(),
    runtime:          runtime ?? null,
    original_language: originalLanguage,
    origin_country:   originCountry,
    certification_ca: certificationCa,
    budget,
    revenue,
    studios:          studios?.length ? studios : null,
    directors:        finalDirectors?.length ? finalDirectors : null,
    writers:          writers?.length ? writers : null,
    spoken_languages: spokenLanguages?.length ? spokenLanguages : null,
    // Use "none" sentinel (not null) so cached movies don't get re-fetched
    // on every detail view just because they have no theatrical release.
    theatrical_ca:    resolvedType === "movie" ? (theatricalCa ?? "none") : null,
    theatrical_us:    resolvedType === "movie" ? (theatricalUs ?? "none") : null,
  };
}

function formatTitle(data: TMDBSearchResult, type?: string | null) {
  const mediaType = type ?? data.media_type ?? "movie";
  return buildTitleRow(data, mediaType);
}

function isCacheStale(cachedAt: string, releaseDate?: string | null): boolean {
  const age = Date.now() - new Date(cachedAt).getTime();
  // Titles released more than 2 years ago rarely change — use a 30-day TTL
  if (releaseDate) {
    const yearsOld = (Date.now() - new Date(releaseDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsOld > 2) return age > 30 * 24 * 60 * 60 * 1000;
  }
  return age > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// Fire-and-forget cache write — doesn't block search response.
// Fetches full detail for titles not yet hydrated (runtime == null).
function cacheTitlesInBackground(
  results: TMDBSearchResult[],
  type: string | null,
  supabase: ReturnType<typeof createClient>,
  tmdbApiKey: string
) {
  (async () => {
    for (const r of results) {
      const mediaType = type ?? r.media_type ?? "movie";
      const titleId   = `${mediaType}:${r.id}`;
      try {
        // Check if already fully hydrated
        const { data: existing } = await supabase
          .from("titles")
          .select("runtime")
          .eq("id", titleId)
          .single();

        if (existing?.runtime != null) continue; // already complete — skip

        // Fetch full detail from TMDB
        const detailUrl = `${TMDB_BASE_URL}/${mediaType}/${r.id}?api_key=${tmdbApiKey}&append_to_response=credits,content_ratings,release_dates`;
        const detailRes = await fetch(detailUrl);
        if (!detailRes.ok) continue;
        const detail: TMDBDetailResult = await detailRes.json();
        const row = buildTitleRow(detail, mediaType);
        await supabase.from("titles").upsert(row, { onConflict: "id" });
        if (detail.genres?.length) {
          const genreRows = detail.genres.map(g => ({ title_id: titleId, genre_id: g.id }));
          await supabase.from("title_genres").upsert(genreRows, { onConflict: "title_id,genre_id" });
        }
      } catch (err) {
        console.error("Background cache error for", titleId, err);
      }
    }
  })();
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ..._reqCors },
  });
}

function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}