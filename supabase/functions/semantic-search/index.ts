// StreamSocial — Semantic Search Edge Function
// Converts a natural language query into a vector and returns ranked title matches.
//
// GET ?query=mind-bending sci-fi thriller&limit=10&media_type=movie
// GET ?query=feel-good romantic comedy&limit=20
//
// Response: { results: [{ title_id, title, overview, poster_path, media_type, similarity }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCors } from "../_shared/cors-utils.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { retryWithBackoff } from "../_shared/retry.ts";
import { CircuitBreaker } from "../_shared/circuit-breaker.ts";

const OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const OPENAI_TIMEOUT_MS = 8000; // 8 second timeout for OpenAI API

const RL_MAX = 60;
const RL_WINDOW_SECS = 60;

// Circuit breaker for OpenAI to prevent cascading failures
const openaiBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  monitoringWindowMs: 60000,
});

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

Deno.serve(async (req: Request) => {
  // ── CORS helpers scoped to this request ──────────────────────────
  const cors = makeCors(req);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const ip = getClientIp(req);
  if (!await checkRateLimit(`semantic-search:${ip}`, RL_MAX, RL_WINDOW_SECS)) {
    return json({ error: "Rate limit exceeded. Please wait a minute." }, 429);
  }

  try {
    // ── Parse query params ────────────────────────────────────────────
    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim();
    const mediaType = url.searchParams.get("media_type"); // "movie" | "tv" | null (both)
    const rawLimit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT));
    const matchLimit = Math.min(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT);

    if (!query) {
      return json({ error: "Missing required param: query" }, 400);
    }

    // ── Init Supabase client (service role for RPC access) ────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Embed the user's query via OpenAI (with timeout + fallback) ────
    let queryVector: number[] | null = null;
    try {
      queryVector = await embedText(query);
    } catch (embedErr) {
      const errMsg = String(embedErr);
      // Fallback to keyword search on timeout or OpenAI error
      if (
        errMsg.includes("timeout") ||
        errMsg.includes("OpenAI") ||
        errMsg.includes("exceeded")
      ) {
        console.warn("[semantic-search] OpenAI timeout/error, falling back to keyword search:", errMsg);
        return await keywordSearch(supabase, query, mediaType, matchLimit);
      }
      throw embedErr;
    }

    // ── Call match_titles() RPC ───────────────────────────────────────
    const { data: matches, error: rpcError } = await supabase.rpc("match_titles", {
      query_embedding: queryVector,
      match_threshold: 0.3,
      match_count: matchLimit,
      p_media_type: (mediaType === "movie" || mediaType === "tv") ? mediaType : null,
    });

    if (rpcError) throw rpcError;

    // ── Fetch full title metadata for matched IDs ─────────────────────
    const titleIds: string[] = (matches ?? []).map((m: { title_id: string }) => m.title_id);

    if (titleIds.length === 0) {
      return json({ results: [] });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout on metadata fetch

    try {
      const { data: titles, error: titlesError } = await supabase
        .from("titles")
        .select("id, title, overview, poster_path, media_type, release_date, vote_average, runtime")
        .in("id", titleIds);

      clearTimeout(timeoutId);
      if (titlesError) throw titlesError;

      // ── Build similarity map and merge ───────────────────────────
      const similarityMap = new Map<string, number>(
        (matches ?? []).map((m: { title_id: string; similarity: number }) => [
          m.title_id,
          m.similarity,
        ])
      );

      const results = (titles ?? [])
        .map((t) => ({ ...t, similarity: similarityMap.get(t.id) ?? 0 }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, matchLimit);

      return json({ results });
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  } catch (err) {
    console.error("[semantic-search] error:", err);
    return json({ error: String(err) }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY secret is not set");

  // Use circuit breaker with retry logic for resilience
  return openaiBreaker.execute(async () => {
    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

        try {
          const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({ model: OPENAI_MODEL, input: text }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const body = await res.text();
            // Retry on 429 or 503, throw immediately on 4xx auth errors
            if (res.status === 429 || res.status === 503) {
              throw new Error(`OpenAI API error ${res.status}: ${body}`);
            }
            throw new Error(`OpenAI embeddings API error ${res.status}: ${body}`);
          }

          const data = await res.json();
          const embedding = data?.data?.[0]?.embedding;
          if (!Array.isArray(embedding)) {
            throw new Error(
              "Invalid embedding response from OpenAI — missing data[0].embedding"
            );
          }
          return embedding as number[];
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            throw new Error(
              `OpenAI request timeout exceeded (${OPENAI_TIMEOUT_MS}ms)`
            );
          }
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000 }
    );
  });
}

async function keywordSearch(
  supabase: ReturnType<typeof createClient>,
  query: string,
  mediaType: string | null,
  limit: number
): Promise<Response> {
  // Fallback: keyword search on title, overview, and other text fields
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  let sql = supabase.from("titles").select(
    "id, title, overview, poster_path, media_type, release_date, vote_average, runtime"
  );

  // Add media_type filter if specified
  if (mediaType === "movie" || mediaType === "tv") {
    sql = sql.eq("media_type", mediaType);
  }

  const { data: titles, error } = await sql.limit(limit);

  if (error) {
    throw error;
  }

  // Client-side keyword matching: rank results by number of keyword matches
  const scored = (titles ?? [])
    .map((t) => {
      const titleLower = (t.title ?? "").toLowerCase();
      const overviewLower = (t.overview ?? "").toLowerCase();
      const matchCount = keywords.filter(
        (kw) => titleLower.includes(kw) || overviewLower.includes(kw)
      ).length;
      return { ...t, similarity: matchCount / Math.max(keywords.length, 1) };
    })
    .filter((t) => t.similarity > 0) // Only include titles with at least one keyword match
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return new Response(
    JSON.stringify({ results: scored, fallback: true }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
