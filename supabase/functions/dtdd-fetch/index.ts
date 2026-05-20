import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { makeCors } from '../_shared/cors-utils.ts';

const DTDD_BASE = 'https://www.doesthedogdie.com';
const YES_THRESHOLD = 0.70;   // 70% community yes votes = warning present
const CACHE_DAYS    = 30;     // days before re-fetching from DTDD

// Curated topic keys we surface in the UI (must match DTDD topic.image values)
const CURATED_KEYS = new Set([
  'dog','cat','animal','suicide','rape','abusechild','abuse','torture',
  'alcoholism','drugs','eating','racism','homophobia','antisemitism',
  'cancer','miscarriage','jumpscare','flashinglights','clowns','needles',
]);

interface TopicStat {
  // DTDD actual field names (as of 2026):
  //   topic.image = slug key e.g. "dog", "suicide"
  //   topic.name  = human label e.g. "a dog dies"
  //   yesSum / noSum = community yes/no vote counts
  topic?: { image?: string; name?: string };
  yesSum?: number;
  noSum?: number;
}

interface CachedTopic {
  topicKey: string;   // = topic.image e.g. "dog"
  topicName: string;  // = topic.name  e.g. "a dog dies"
  yesSum: number;
  noSum: number;
}

// Optional per-title metadata the caller can pass to avoid a DB round-trip
interface TitleMeta {
  title?: string;
}

async function dtddGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${DTDD_BASE}${path}`, {
    headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function extractStats(data: Record<string, unknown>): CachedTopic[] {
  const stats: TopicStat[] = (data.topicItemStats as TopicStat[]) || [];
  return stats
    .filter((s) => {
      const key = s.topic?.image ?? '';
      if (!CURATED_KEYS.has(key)) return false;
      const yes = s.yesSum ?? 0;
      const no  = s.noSum  ?? 0;
      const total = yes + no;
      return total >= 5 && yes / total >= YES_THRESHOLD;
    })
    .map((s) => ({
      topicKey:  s.topic?.image ?? '',
      topicName: s.topic?.name  ?? '',
      yesSum:    s.yesSum ?? 0,
      noSum:     s.noSum  ?? 0,
    }));
}

async function getTriggeredTopics(
  supabase: ReturnType<typeof createClient>,
  titleId: string,
  apiKey: string,
  meta?: TitleMeta,
): Promise<CachedTopic[]> {
  const [, tmdbIdStr] = titleId.split(':');
  const tmdbId = parseInt(tmdbIdStr, 10);
  if (isNaN(tmdbId)) return [];

  // Use caller-supplied title name first; fall back to DB lookup
  let titleName = meta?.title?.trim() ?? '';

  if (!titleName) {
    const { data: titleRow } = await supabase
      .from('titles')
      .select('title')
      .eq('id', titleId)
      .single();
    titleName = titleRow?.title?.trim() ?? '';
  }

  if (!titleName) return [];

  // Search DTDD by title (no year — year breaks fuzzy matching)
  const q = encodeURIComponent(titleName);
  const searchBody = await dtddGet(`/dddsearch?q=${q}`, apiKey) as Record<string, unknown> | null;
  const searchItems = (searchBody?.items as Record<string, unknown>[]) ?? [];

  if (searchItems.length === 0) return [];

  // Prefer exact TMDB ID match; fall back to first result
  const match = searchItems.find((r) => Number(r.tmdbid) === tmdbId);
  const candidate = match ?? searchItems[0];

  if (!candidate?.id) return [];

  const data = await dtddGet(`/media/${candidate.id}`, apiKey) as Record<string, unknown> | null;
  if (!data?.topicItemStats) return [];
  return extractStats(data);
}

// ── Rate limiting (per-isolate, in-memory) ──────────────────
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(req: Request, max: number, windowMs: number): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip') ?? 'unknown';
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
  const corsHeaders = makeCors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Rate limit: 30 calls / minute / IP (each call may trigger 5 DTDD lookups)
  if (!checkRateLimit(req, 30, 60_000)) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } });
  }

  // Require an authenticated user (anon key OK, just not anonymous random IPs)
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const apiKey = Deno.env.get('DTDD_API_KEY') ?? '';
  if (!apiKey) {
    return Response.json({ error: 'DTDD_API_KEY not configured' }, { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { title_ids?: string[]; titles_meta?: Record<string, TitleMeta> };
  try { body = await req.json(); } catch (_) { body = {}; }

  const title_ids: string[] = Array.isArray(body.title_ids)
    ? body.title_ids
        .filter((id: string) => /^(movie|tv):\d{1,9}$/.test(id))
        .slice(0, 10)
    : [];
  if (title_ids.length === 0) return Response.json({}, { headers: corsHeaders });

  const titles_meta: Record<string, TitleMeta> = body.titles_meta ?? {};

  // ── Check cache ──────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data: cached } = await supabase
    .from('dtdd_cache')
    .select('title_id, topics, cached_at')
    .in('title_id', title_ids);

  const result: Record<string, CachedTopic[]> = {};
  const misses: string[] = [];

  (cached ?? []).forEach((row: { title_id: string; topics: CachedTopic[]; cached_at: string }) => {
    if (row.cached_at >= cutoff) {
      result[row.title_id] = row.topics;
    } else {
      misses.push(row.title_id);
    }
  });

  title_ids.forEach((id) => { if (!(id in result)) misses.push(id); });

  // ── Fetch misses — cap at 5 DTDD API calls per request to avoid timeout ──
  // DB-cached IDs are already in result; only uncached IDs need DTDD lookups.
  // IDs beyond the first 5 misses are skipped (return nothing; re-fetched next call).
  const firstBatch = misses.slice(0, 5);
  await Promise.all(firstBatch.map(async (titleId) => {
    try {
      const topics = await getTriggeredTopics(supabase, titleId, apiKey, titles_meta[titleId]);
      result[titleId] = topics;
      await supabase.from('dtdd_cache').upsert({
        title_id:  titleId,
        topics,
        cached_at: new Date().toISOString(),
      });
    } catch (_) {
      result[titleId] = [];
    }
  }));

  return Response.json(result, { headers: corsHeaders });
});
