// StreamSocial — Generate Embedding Edge Function
// Generates and stores an OpenAI vector embedding for a single title or a batch of titles.
//
// POST /generate-embedding
// Body (single):  { "title_id": "movie:550" }
// Body (batch):   { "title_ids": ["movie:550", "tv:1396", "movie:27205"] }
// Body (backfill):{ "backfill": true, "limit": 100 }  ← embeds titles with no embedding yet
//
// Response: { embedded: ["movie:550", ...], skipped: [], errors: [] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCors } from "../_shared/cors-utils.ts";

const OPENAI_MODEL = "text-embedding-3-small";
const BATCH_CONCURRENCY = 5; // parallel OpenAI calls at once

// In-memory rate limiter (20 req / 60 s per IP).
// NOTE: resets on process restart — bypassable via cold-start cycling.
// Replace with Deno KV or Upstash Redis for hard enforcement.
const RL_MAX = 20;
const RL_WINDOW_MS = 60_000;
const rlStore = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rlStore.get(ip);
  if (!entry || now - entry.windowStart > RL_WINDOW_MS) {
    rlStore.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RL_MAX) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = makeCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405, corsHeaders);
  }

  // Rate-limit all callers by IP. Backfill/admin paths are still rate-limited
  // here; they pass a separate EMBED_WEBHOOK_SECRET for authorization rather
  // than bypassing limits entirely.
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return json({ error: "Rate limit exceeded. Please wait a minute." }, 429, corsHeaders);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = false; // kept for backfill guard below; no longer bypasses rate limit

  try {
    const body = await req.json().catch(() => ({}));

    // ── Init Supabase (service role for unrestricted reads/writes) ────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Resolve which title_ids to embed ──────────────────────────────
    let titleIds: string[] = [];

    // ── Supabase DB webhook payload ───────────────────────────
    // Shape: { type: "INSERT", table: "titles", record: { id: "movie:550", ... } }
    // Supabase always sends the service role key as the Authorization Bearer for
    // webhook calls — we validate against that to block arbitrary callers.
    // Also accepts EMBED_WEBHOOK_SECRET if set (fallback / rotation path).
    if (body.type === "INSERT" && body.table === "titles" && body.record?.id) {
      const webhookSecret = Deno.env.get("EMBED_WEBHOOK_SECRET") ?? "";
      const authHeader    = req.headers.get("Authorization") ?? "";
      if (!webhookSecret) {
        console.error("[generate-embedding] EMBED_WEBHOOK_SECRET is not set — refusing webhook calls");
        return json({ error: "Webhook secret not configured" }, 503, corsHeaders);
      }
      if (authHeader !== `Bearer ${webhookSecret}`) {
        return json({ error: "Unauthorized webhook call" }, 401, corsHeaders);
      }
      titleIds = [body.record.id];
    } else if (body.backfill === true) {
      // Backfill is service-role only
      if (!isServiceRole) {
        return json({ error: "Backfill requires service role" }, 403, corsHeaders);
      }
      // Find titles that have no embedding yet
      const limit = Math.min(body.limit ?? 100, 500);
      const { data, error } = await supabase.rpc("titles_missing_embeddings", {
        row_limit: limit,
      });
      if (error) throw error;
      titleIds = (data ?? []).map((r: { title_id: string }) => r.title_id);
    } else if (Array.isArray(body.title_ids)) {
      titleIds = body.title_ids.slice(0, 100);
    } else if (typeof body.title_id === "string") {
      titleIds = [body.title_id];
    } else {
      return json({ error: "Provide title_id, title_ids[], or backfill:true" }, 400, corsHeaders);
    }

    // Validate all title IDs match the expected format
    titleIds = titleIds.filter((id) => /^(movie|tv):\d{1,9}$/.test(id));

    if (titleIds.length === 0) {
      return json({ embedded: [], skipped: [], errors: [], message: "Nothing to embed." }, 200, corsHeaders);
    }

    // ── Fetch title metadata (title + overview + genres) ─────────────
    const { data: titlesData, error: titlesErr } = await supabase
      .from("titles")
      .select("id, title, overview")
      .in("id", titleIds);
    if (titlesErr) throw titlesErr;

    // Build a map for quick lookup
    const titlesMap = new Map(
      (titlesData ?? []).map((t) => [t.id, t])
    );

    // Fetch genre names for all these titles in one query
    const { data: genreRows, error: genreErr } = await supabase
      .from("title_genres")
      .select("title_id, genres(name)")
      .in("title_id", titleIds); // title_genres.title_id is the FK — this is correct
    if (genreErr) throw genreErr;

    // Group genres by title_id
    const genresByTitle = new Map<string, string[]>();
    for (const row of genreRows ?? []) {
      const name = (row.genres as { name: string } | null)?.name;
      if (!name) continue;
      if (!genresByTitle.has(row.title_id)) genresByTitle.set(row.title_id, []);
      genresByTitle.get(row.title_id)!.push(name);
    }

    // ── Process in controlled-concurrency batches ─────────────────────
    const embedded: string[] = [];
    const skipped: string[] = [];
    const errors: { title_id: string; error: string }[] = [];

    // Split into chunks for parallel processing
    const chunks = chunkArray(titleIds, BATCH_CONCURRENCY);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (titleId) => {
          const titleMeta = titlesMap.get(titleId);
          if (!titleMeta) {
            skipped.push(titleId);
            return;
          }

          try {
            // Build the text to embed: "Title. Overview. Genre1 Genre2"
            const genres = genresByTitle.get(titleId) ?? [];
            const inputText = buildEmbeddingInput(
              titleMeta.title,
              titleMeta.overview,
              genres
            );

            // Call OpenAI
            const vector = await embedText(inputText);

            // Upsert into title_embeddings
            const { error: upsertErr } = await supabase
              .from("title_embeddings")
              .upsert(
                {
                  title_id: titleId,
                  embedding: vector,
                  embedded_at: new Date().toISOString(),
                },
                { onConflict: "title_id" }
              );

            if (upsertErr) throw upsertErr;
            embedded.push(titleId);
          } catch (err) {
            console.error(`[generate-embedding] Failed for ${titleId}:`, err);
            errors.push({ title_id: titleId, error: String(err) });
          }
        })
      );
    }

    return json({ embedded, skipped, errors }, 200, corsHeaders);
  } catch (err) {
    console.error("[generate-embedding] fatal error:", err);
    return json({ error: String(err) }, 500, corsHeaders);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds the input string for embedding.
 * Format: "Title. Overview text here. Action Comedy Thriller"
 * Truncated to ~2000 chars to stay well within OpenAI's 8191 token limit.
 */
function buildEmbeddingInput(
  title: string,
  overview: string | null,
  genres: string[]
): string {
  const parts = [
    title ?? "",
    overview ?? "",
    genres.join(" "),
  ].filter(Boolean);
  return parts.join(". ").slice(0, 2000);
}

async function embedText(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY secret is not set");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Invalid embedding response from OpenAI — missing data[0].embedding");
  }
  return embedding as number[];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
