import ListDetailClient from './ListDetailClient';

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListDetailClient listId={id} />;
}
