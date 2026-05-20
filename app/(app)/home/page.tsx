import HomeClient, { type MatchTitle, type QuickPick } from './HomeClient';
import { createSupabasePublicClient } from '@/lib/supabase-server';

// Default mood query (MOODS[0] — "Mind-blowing") fetched server-side so the
// hero renders immediately without waiting for client JS + semantic-search round-trips.
const DEFAULT_QUERY = 'mind-blowing psychological mind-bending thriller';

async function getDefaultRecommendation(): Promise<{ match: MatchTitle | null; quickPicks: QuickPick[] }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { match: null, quickPicks: [] };
  }

  try {
    // Single client instance — used for both the functions.invoke() call and the
    // DB enrichment query below.  The SDK handles publishable-key → JWT auth
    // internally, avoiding the 401 that raw fetch() gets with sb_publishable__ keys.
    const db = createSupabasePublicClient();
    const { data, error } = await db.functions.invoke(
      `semantic-search?query=${encodeURIComponent(DEFAULT_QUERY)}&limit=12`,
      { method: 'GET' }
    );

    if (error || !data) return { match: null, quickPicks: [] };

    const results: MatchTitle[] = data.results ?? [];
    if (!results.length) return { match: null, quickPicks: [] };

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
    const heroIdx = Math.floor(Math.random() * Math.min(results.length, 3));
    const heroResult = results[heroIdx];
    const picksPool = results.filter(r => r.id !== heroResult.id);

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
