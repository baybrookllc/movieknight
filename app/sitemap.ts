import type { MetadataRoute } from 'next';
import { createSupabasePublicClient } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/site';

// Refresh hourly — the catalog changes slowly relative to crawl cadence, and
// this keeps the sitemap ISR-cached rather than hitting Supabase per request.
export const revalidate = 3600;

// Public, crawlable routes (must stay out of proxy.ts's PROTECTED list).
const STATIC_ROUTES = ['/home', '/browse', '/trending'];

// Sitemaps cap at 50k URLs; keep well under and bias toward the most popular
// titles, which are the ones worth crawl budget.
const MAX_TITLES = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: path === '/home' ? 1 : 0.7,
  }));

  let titleEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from('titles')
      .select('id, cached_at')
      .order('popularity', { ascending: false })
      .limit(MAX_TITLES);

    // Title ids are of the form "movie:550" and the detail route links to
    // `/${id}` (see components/TitleCard.tsx), so mirror that exact shape here.
    titleEntries = (data ?? []).map((t) => ({
      url: `${SITE_URL}/${t.id}`,
      lastModified: t.cached_at ? new Date(t.cached_at) : now,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  } catch {
    // If the catalog fetch fails, still return the static routes rather than
    // failing the whole /sitemap.xml response.
  }

  return [...staticEntries, ...titleEntries];
}
