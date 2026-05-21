import HomeClient, { type MatchTitle, type QuickPick } from './HomeClient';
import { createSupabasePublicClient } from '@/lib/supabase-server';

// Default mood query (MOODS[0] — "Mind-blowing") fetched server-side so the
// hero renders immediately without waiting for client JS + semantic-search round-trips.
const DEFAULT_QUERY = 'mind-blowing psychological mind-bending thriller';

async function getDefaultRecommendation(): Promise<{ match: MatchTitle | null; quickPicks: QuickPick[] }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('[HomePage SSR] Missing Supabase env vars, skipping SSR fetch');
    return { match: null, quickPicks: [] };
  }

  try {
    // Single client instance for DB queries
    const db = createSupabasePublicClient();

    // For SSR, use fast keyword search instead of waiting for semantic embeddings
    // Semantic search will run on client-side where it's more reliable
    console.log('[HomePage SSR] Using fast keyword-based search for initial hero');

    const { data: results, error } = await db.rpc('get_titles_by_keywords', {
      p_query: DEFAULT_QUERY,
      p_media_type: null,
      p_limit: 12,
    });

    if (error) {
      console.warn('[HomePage SSR] Keyword search failed, letting client handle fetch:', error?.message);
      return { match: null, quickPicks: [] };
    }

    const titleResults: MatchTitle[] = (results ?? []) as MatchTitle[];
    console.log('[HomePage SSR] Keyword search succeeded:', titleResults.length, 'results');

    if (!titleResults.length) {
      console.warn('[HomePage SSR] No results from keyword search');
      return { match: null, quickPicks: [] };
    }

    // Enrich with backdrop_path and runtime
    const ids = titleResults.map(r => r.id);
    const { data: extras } = await db
      .from('titles')
      .select('id,backdrop_path,runtime')
      .in('id', ids);
    const extrasMap = Object.fromEntries((extras ?? []).map(e => [e.id, e]));
    for (const r of titleResults) Object.assign(r, extrasMap[r.id] ?? {});

    // Pick a random title from the top 3 matches for variety across page loads
    const topResultsCount = Math.min(titleResults.length, 3);
    const heroIdx = Math.floor(Math.random() * topResultsCount);
    const heroResult = titleResults[heroIdx];
    const picksPool = titleResults.filter(r => r.id !== heroResult.id);

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
