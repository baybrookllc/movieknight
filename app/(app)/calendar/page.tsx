import { createSupabasePublicClient } from '@/lib/supabase-server';
import TitleCard from '@/components/TitleCard';

export const revalidate = 3600; // revalidate every hour

interface Title {
  id: string;
  title: string;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  release_date: string | null;
  vote_average: number | null;
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupByMonth(titles: Title[]): Map<string, Title[]> {
  const map = new Map<string, Title[]>();
  for (const t of titles) {
    const key = t.release_date
      ? formatMonth(t.release_date)
      : 'Unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return map;
}

export default async function CalendarPage() {
  const supabase = createSupabasePublicClient();
  const today = new Date().toISOString().slice(0, 10);

  // Try upcoming titles first
  const { data: upcoming } = await supabase
    .from('titles')
    .select('id,title,poster_path,media_type,release_date,vote_average')
    .gte('release_date', today)
    .order('release_date', { ascending: true })
    .limit(48);

  const hasUpcoming = (upcoming ?? []).length > 0;
  let items: Title[] = (upcoming ?? []) as Title[];
  let fallback = false;

  if (!hasUpcoming) {
    // Fall back to most recently added titles
    const { data: recent } = await supabase
      .from('titles')
      .select('id,title,poster_path,media_type,release_date,vote_average')
      .order('cached_at', { ascending: false })
      .limit(48);
    items = (recent ?? []) as Title[];
    fallback = true;
  }

  const grouped = groupByMonth(items);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Coming Soon</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {fallback
            ? 'Recently added to the catalog.'
            : 'Upcoming releases — add to your Want list.'}
        </p>
      </div>

      {/* Month sections */}
      {items.length === 0 ? (
        <div style={{
          padding: '48px 0',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 14,
        }}>
          No titles found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {Array.from(grouped.entries()).map(([month, monthTitles]) => (
            <section key={month}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}>
                <h2 style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--text)',
                  margin: 0,
                }}>
                  {fallback ? 'Recently Added' : month}
                </h2>
                <div style={{
                  flex: 1,
                  height: 1,
                  background: 'var(--border)',
                }} />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {monthTitles.length} title{monthTitles.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 20,
              }}>
                {monthTitles.map(t => (
                  <div key={t.id}>
                    <TitleCard
                      id={t.id}
                      title={t.title}
                      poster_path={t.poster_path}
                      media_type={t.media_type}
                      vote_average={t.vote_average ?? undefined}
                      release_date={t.release_date}
                    />
                    {t.release_date && !fallback && (
                      <div style={{
                        fontSize: 11,
                        color: 'var(--accent)',
                        fontWeight: 600,
                        marginTop: 4,
                        paddingLeft: 2,
                      }}>
                        {new Date(t.release_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
