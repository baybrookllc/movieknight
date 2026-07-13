// ============================================================
//  MovieKnight — TV Seasons Edge Function
//  File: supabase/functions/tv-seasons/index.ts
//
//  HOW IT WORKS:
//  1. App calls this with a TMDB tv show ID
//  2. Function fetches season + episode data from TMDB
//  3. Returns structured season/episode list to the app
//
//  ENDPOINT:
//  GET ?tmdb_id=1396
//
//  DEPLOY COMMAND:
//  supabase functions deploy tv-seasons
// ============================================================

interface TMDBEpisode {
  episode_number: number;
  name: string;
}

interface TMDBSeason {
  season_number: number;
  name: string;
  episode_count: number;
  episodes?: TMDBEpisode[];
}

interface TMDBSeasonDetail {
  season_number: number;
  name: string;
  episodes: TMDBEpisode[];
}

import { makeCors } from "../_shared/cors-utils.ts";

// ── Rate limiting (per-isolate, in-memory) ──────────────────
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(req: Request, max: number, windowMs: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

Deno.serve(async (req: Request) => {
  const cors = makeCors(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  // 60 requests / minute / IP
  if (!checkRateLimit(req, 60, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60", ...cors } });
  }

  try {
    const url    = new URL(req.url);
    const tmdbId = url.searchParams.get("tmdb_id");

    const err_ = (msg: string, s: number) => jsonResponse({ error: msg }, s, cors);

    // Validate tmdb_id is a positive integer
    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return err_("Invalid tmdb_id", 400);
    }

    const tmdbApiKey = Deno.env.get("TMDB_API_KEY")!;
    const TMDB_BASE  = "https://api.themoviedb.org/3";

    // 1. Fetch the top-level TV show to get season list
    const showRes = await fetch(`${TMDB_BASE}/tv/${tmdbId}?api_key=${tmdbApiKey}`, { signal: AbortSignal.timeout(8000) });
    if (!showRes.ok) return err_(`TMDB fetch failed: ${showRes.status}`, 502);

    const show = await showRes.json();
    const seasonList: TMDBSeason[] = (show.seasons ?? []).filter(
      (s: TMDBSeason) => s.season_number > 0  // skip "Specials" (season 0)
    );

    // 2. Fetch full episode list for each season in parallel
    const seasonDetails: TMDBSeasonDetail[] = await Promise.all(
      seasonList.map(async (s) => {
        const res = await fetch(
          `${TMDB_BASE}/tv/${tmdbId}/season/${s.season_number}?api_key=${tmdbApiKey}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) {
          // Return skeleton if a single season fetch fails
          return { season_number: s.season_number, name: s.name, episodes: [] };
        }
        const detail = await res.json();
        return {
          season_number: s.season_number,
          name: s.name,
          episodes: (detail.episodes ?? []).map((e: TMDBEpisode) => ({
            episode_number: e.episode_number,
            name: e.name,
          })),
        };
      })
    );

    // 3. Build response
    const seasons = seasonDetails.map((s) => ({
      season_number:  s.season_number,
      name:           s.name,
      episode_count:  s.episodes.length,
      episodes:       s.episodes,
    }));

    return jsonResponse({ seasons }, 200, cors);

  } catch (err) {
    console.error("tv-seasons error:", err);
    return jsonResponse({ error: "Internal server error" }, 500, cors);
  }
});

function jsonResponse(data: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}
