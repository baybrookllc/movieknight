import HomeClient, { type MatchTitle, type QuickPick } from './HomeClient';
import { createSupabasePublicClient } from '@/lib/supabase-server';

// Default mood query (MOODS[0] — "Mind-blowing") fetched server-side so the
// hero renders immediately without waiting for client JS + semantic-search round-trips.
const DEFAULT_QUERY = 'mind-blowing psychological mind-bending thriller';

async function getDefaultRecommendation(): Promise<{ match: MatchTitle | null; quickPicks: QuickPick[] }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return { match: null, quickPicks: [] };
  }

  try {
    const functionsUrl = `${supabaseUrl}/functions/v1`;
    const res = await fetch(
      `${functionsUrl}/semantic-search?query=${encodeURIComponent(DEFAULT_QUERY)}&limit=12`,
      {
        headers: { Authorization: `Bearer ${anonKey}` },
        next: { revalidate: 3600 }, // cache this fetch for 1 hour
        signal: AbortSignal.timeout(6000), // don't block page render for more than 6s
      }
    );

    if (!res.ok) return { match: null, quickPicks: [] };

    const data = await res.json();
    const results: MatchTitle[] = data.results ?? [];
    if (!results.length) return { match: null, quickPicks: [] };

    // Enrich with backdrop_path and runtime — semantic-search doesn't return these
    const supabase = createSupabasePublicClient();
    const ids = results.map(r => r.id);
    const { data: extras } = await supabase
      .from('titles')
      .select('id,backdrop_path,runtime')
      .in('id', ids);
    const extrasMap = Object.fromEntries((extras ?? []).map(e => [e.id, e]));
    for (const r of results) Object.assign(r, extrasMap[r.id] ?? {});

    return {
      match: results[0],
      quickPicks: results.slice(1, 8).map(r => ({
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
