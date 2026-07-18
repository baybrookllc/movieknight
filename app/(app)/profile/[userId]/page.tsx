import FriendProfileClient from './FriendProfileClient';

export default async function FriendProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <FriendProfileClient userId={userId} />;
}
