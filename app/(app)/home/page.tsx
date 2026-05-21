import HomeClient, { type MatchTitle, type QuickPick } from './HomeClient';
import { createSupabasePublicClient } from '@/lib/supabase-server';

// Default mood query (MOODS[0] — "Mind-blowing") fetched server-side so the
// hero renders immediately without waiting for client JS + semantic-search round-trips.
const DEFAULT_QUERY = 'mind-blowing psychological mind-bending thriller';

async function getDefaultRecommendation(): Promise<{ match: MatchTitle | null; quickPicks: QuickPick[] }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('[HomePage SSR] Missing Supabase env vars');
    return { match: null, quickPicks: [] };
  }

  try {
    // Single client instance — used for both the functions.invoke() call and the
    // DB enrichment query below.  The SDK handles publishable-key → JWT auth
    // internally, avoiding the 401 that raw fetch() gets with sb_publishable__ keys.
    const db = createSupabasePublicClient();

    // Cache-bust to avoid stale embedding results
    const cacheKey = `${Date.now()}-${Math.random()}`;
    console.log('[HomePage SSR] Calling semantic-search for:', DEFAULT_QUERY.slice(0, 30) + '...');

    const { data, error } = await db.functions.invoke(
      `semantic-search?query=${encodeURIComponent(DEFAULT_QUERY)}&limit=12&cb=${cacheKey}`,
      { method: 'GET', signal: AbortSignal.timeout(5000) }
    );

    if (error) {
      console.error('[HomePage SSR] semantic-search error:', error);
      return { match: null, quickPicks: [] };
    }

    if (!data) {
      console.error('[HomePage SSR] semantic-search returned no data');
      return { match: null, quickPicks: [] };
    }

    const results: MatchTitle[] = data.results ?? [];
    console.log('[HomePage SSR] semantic-search returned', results.length, 'results');

    if (!results.length) {
      console.warn('[HomePage SSR] No results from semantic-search');
      return { match: null, quickPicks: [] };
    }

    // Enrich with backdrop_path and runtime — semantic-search doesn't return these
    const ids = results.map(r => r.id);
    const { data: extras } = await db
      .from('titles')
      .select('id,backdrop_path,runtime')
      .in('id', ids);
    const extrasMap = Object.fromEntries((extras ?? []).map(e => [e.id, e]));
    for (const r of results) Object.assign(r, extrasMap[r.id] ?? {});

    // Pick a random title from the top 3 matches so visitors see variety
    // across page loads rather than always the same #1 result.
    const topResultsCount = Math.min(results.length, 3);
    const heroIdx = Math.floor(Math.random() * topResultsCount);
    const heroResult = results[heroIdx];
    const picksPool = results.filter(r => r.id !== heroResult.id);

    console.log(`[HomePage SSR] Selected hero from position ${heroIdx} (top ${topResultsCount}):`, heroResult.title);

    return {
      match: heroResult,
      quickPicks: picksPool.slice(0, 7).map(r => ({
        id: r.id,
        title: r.title,
        poster_path: r.poster_path,
        vote_average: r.vote_average,
        similarity: r.similarity,
      })),
    };
  } catch (err) {
    console.error('[HomePage SSR] Default recommendation fetch failed:', err);
    return { match: null, quickPicks: [] };
  }
}

export default async function HomePage() {
  const { match, quickPicks } = await getDefaultRecommendation();
  return <HomeClient initialMatch={match} initialQuickPicks={quickPicks} />;
}
