import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import ExecutiveDashboardClient from '@/components/dashboard/ExecutiveDashboardClient';

export const metadata = {
  title: 'Executive Dashboard | MovieKnight',
  description: 'System health, architecture, and tech stack overview.',
};

export default async function ExecutiveDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Admin authorization check
  const adminEmails = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    // If not an admin, we can either redirect or show a 403 message.
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Access Denied</h1>
        <p style={{ color: 'var(--text-muted)' }}>You do not have permission to view this dashboard.</p>
      </div>
    );
  }

  // Fetch initial health metrics to pass to the client
  // Using the server client so we can query protected or unprotected tables as needed.
  // We'll just grab counts here to prove DB connectivity.
  const [titlesCount, usersCount, editionsCount] = await Promise.all([
    supabase.from('titles').select('id', { count: 'exact', head: true }).then(r => r.count || 0),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).then(r => r.count || 0),
    supabase.from('product_editions').select('id', { count: 'exact', head: true }).then(r => r.count || 0)
  ]);

  const initialMetrics = {
    titles: titlesCount,
    users: usersCount,
    editions: editionsCount,
    timestamp: new Date().toISOString(),
  };

  return <ExecutiveDashboardClient initialMetrics={initialMetrics} />;
}
