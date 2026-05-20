import { Metadata } from 'next';
import DetailClient from '@/components/DetailClient';
import { TMDB_BACKDROP, TMDB_IMG, truncate } from '@/lib/utils';

// Server-side fetch — queries DB directly (avoids edge function Bearer token issues)
async function getTitle(decodedId: string) {
  try {
    const [mediaType] = decodedId.split(':');
    if (mediaType !== 'movie' && mediaType !== 'tv') return null;

    const { createSupabasePublicClient } = await import('@/lib/supabase-server');
    const supabase = createSupabasePublicClient();

    const { data: title } = await supabase
      .from('titles')
      .select('*')
      .eq('id', decodedId)
      .single();

    if (!title) return null;

    const { data: genres } = await supabase
      .from('title_genres')
      .select('genre_id, genres(name)')
      .eq('title_id', decodedId);

    return { ...title, genres: genres ?? [] };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ titleId: string }>;
}): Promise<Metadata> {
  const { titleId } = await params;
  const decodedId = decodeURIComponent(titleId);
  const data = await getTitle(decodedId);
  if (!data) return { title: 'CineStream' };
  const poster = data.poster_path ? `${TMDB_IMG}${data.poster_path}` : undefined;
  return {
    title: `${data.title} — CineStream`,
    description: truncate(data.overview, 160) || `Watch and track ${data.title} on CineStream.`,
    openGraph: {
      title: data.title,
      description: truncate(data.overview, 160) || '',
      images: poster ? [{ url: poster }] : [],
    },
  };
}

export default async function DetailPage({
  params,
}: {
  params: Promise<{ titleId: string }>;
}) {
  const { titleId } = await params;
  const decodedId = decodeURIComponent(titleId); // e.g. 'movie:550'
  const [mediaType] = decodedId.split(':');
  const data = await getTitle(decodedId);

  if (!data) {
    return (
      <div className="empty-state">
        <p>Title not found or failed to load.</p>
      </div>
    );
  }

  return (
    <DetailClient
      titleId={decodedId}          // pass decoded ID so DB queries work correctly
      mediaType={mediaType as 'movie' | 'tv'}
      data={data}
    />
  );
}
