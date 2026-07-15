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
    supabase.from('profiles').select('id', { count: 'exact', head: true }).then(r => r.count || 0).catch(() => 0),
    supabase.from('product_editions').select('id', { count: 'exact', head: true }).then(r => r.count || 0)
  ]);

  const functionsToPing = [
    { name: 'semantic-search', desc: 'AI vibe search via pgvector' },
    { name: 'tmdb-cache', desc: 'TMDB proxy and rate limiter' },
    { name: 'generate-embedding', desc: 'Background webhook for new titles' },
    { name: 'dtdd-fetch', desc: 'Content warnings from DoesTheDogDie' },
    { name: 'tv-auth', desc: 'Device flow for TV apps' },
    { name: 'tv-seasons', desc: 'Season/episode metadata proxy' },
    { name: 'notify-watchlist', desc: 'Cron job for watchlist notifications' },
    { name: 'delete-account', desc: 'Data wipe for account deletion' },
    { name: 'health-monitor', desc: 'Synthetic uptime pinger' }
  ];

  const edgeFunctionsStatus = await Promise.all(
    functionsToPing.map(async (fn) => {
      const start = Date.now();
      try {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${fn.name}`;
        const res = await fetch(url, { method: 'OPTIONS', signal: AbortSignal.timeout(3000) });
        const latency = Date.now() - start;
        return { ...fn, status: res.ok ? 'online' : 'offline', latency };
      } catch (e) {
        return { ...fn, status: 'offline', latency: Date.now() - start };
      }
    })
  );

  const initialMetrics = {
    titles: titlesCount,
    users: usersCount,
    editions: editionsCount,
    timestamp: new Date().toISOString(),
    edgeFunctions: edgeFunctionsStatus,
  };

  return <ExecutiveDashboardClient initialMetrics={initialMetrics} />;
}
