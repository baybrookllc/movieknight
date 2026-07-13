// MovieKnight — Semantic Search Edge Function
// Converts a natural language query into a vector and returns ranked title matches.
//
// GET ?query=mind-bending sci-fi thriller&limit=10&media_type=movie
// GET ?query=feel-good romantic comedy&limit=20
//
// Response: { results: [{ title_id, title, overview, poster_path, media_type, similarity }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCors } from "../_shared/cors-utils.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { embedText } from "../_shared/openai-embeddings.ts";
import { getClientIp } from "../_shared/request-utils.ts";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const RL_MAX = 60;
const RL_WINDOW_SECS = 60;

Deno.serve(async (req: Request) => {
  const cors = makeCors(req);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const ip = getClientIp(req);
  if (!await checkRateLimit(`semantic-search:${ip}`, RL_MAX, RL_WINDOW_SECS)) {
    return json({ error: "Rate limit exceeded. Please wait a minute." }, 429);
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim();
    const mediaType = url.searchParams.get("media_type"); // "movie" | "tv" | null (both)
    const rawLimit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT));
    const matchLimit = Math.min(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT);

    if (!query) {
      return json({ error: "Missing required param: query" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Embed the query; fall back to keyword search on any OpenAI failure
    let queryVector: number[];
    try {
      queryVector = await embedText(query);
    } catch (embedErr) {
      console.warn("[semantic-search] OpenAI error, falling back to keyword search:", String(embedErr));
      return keywordSearch(supabase, query, mediaType, matchLimit);
    }

    const { data: matches, error: rpcError } = await supabase.rpc("match_titles", {
      query_embedding: queryVector,
      match_threshold: 0.3,
      match_count: matchLimit,
      p_media_type: (mediaType === "movie" || mediaType === "tv") ? mediaType : null,
    });

    if (rpcError) throw rpcError;

    const titleIds: string[] = (matches ?? []).map((m: { title_id: string }) => m.title_id);
    if (titleIds.length === 0) return json({ results: [] });

    const { data: titles, error: titlesError } = await supabase
      .from("titles")
      .select("id, title, overview, poster_path, media_type, release_date, vote_average, runtime")
      .in("id", titleIds);

    if (titlesError) throw titlesError;

    const similarityMap = new Map<string, number>(
      (matches ?? []).map((m: { title_id: string; similarity: number }) => [m.title_id, m.similarity])
    );

    const results = (titles ?? [])
      .map((t) => ({ ...t, similarity: similarityMap.get(t.id) ?? 0 }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, matchLimit);

    return json({ results });
  } catch (err) {
    console.error("[semantic-search] error:", err);
    return json({ error: String(err) }, 500);
  }
});

async function keywordSearch(
  supabase: ReturnType<typeof createClient>,
  query: string,
  mediaType: string | null,
  limit: number
): Promise<Response> {
  const { data: results, error } = await supabase.rpc("get_titles_by_keywords", {
    p_query: query,
    p_media_type: (mediaType === "movie" || mediaType === "tv") ? mediaType : null,
    p_limit: limit,
  });

  if (error) {
    console.error("[semantic-search] keyword RPC error:", error);
    throw error;
  }

  return new Response(
    JSON.stringify({ results: results ?? [], fallback: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
