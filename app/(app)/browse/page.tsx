import BrowseClient from '@/components/BrowseClient';

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; format?: string; sort?: string }>;
}) {
  const params = await searchParams;
  return (
    <BrowseClient
      initialQuery={params.q ?? ''}
      initialFormat={params.format ?? ''}
    />
  );
}
