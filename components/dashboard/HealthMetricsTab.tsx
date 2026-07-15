'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const cardStyle: React.CSSProperties = {
  padding: 24,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

interface HealthMetricsTabProps {
  initialMetrics: {
    titles: number;
    users: number;
    editions: number;
    timestamp: string;
    edgeFunctions: Array<{
      name: string;
      desc: string;
      status: 'online' | 'offline';
      latency: number;
    }>;
  };
}

export default function HealthMetricsTab({ initialMetrics }: HealthMetricsTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh(); // This will re-fetch the server component and update initialMetrics
    });
  };

  const formattedTime = new Date(initialMetrics.timestamp).toLocaleTimeString();

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Live System Telemetry
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            Last updated: {formattedTime}
          </div>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isPending}
          className="btn btn-primary"
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          {isPending ? 'Refreshing...' : 'Refresh Metrics'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <MetricCard 
          title="Tracked Titles" 
          value={initialMetrics.titles.toLocaleString()} 
          subtitle="Total movies & TV shows in catalog"
          status="online"
        />
        <MetricCard 
          title="Registered Users" 
          value={initialMetrics.users.toLocaleString()} 
          subtitle="Active profiles in the database"
          status="online"
        />
        <MetricCard 
          title="Commerce Editions" 
          value={initialMetrics.editions.toLocaleString()} 
          subtitle="Physical media products (Phase P0)"
          status={initialMetrics.editions > 0 ? "online" : "warning"}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Edge Functions Health
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {initialMetrics.edgeFunctions.map(fn => (
            <div key={fn.name} style={{ padding: 16, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: fn.status === 'online' ? '#10b981' : '#ef4444' }} />
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text)' }}>{fn.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fn.desc}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: fn.status === 'online' ? 'var(--text-muted)' : '#ef4444' }}>
                {fn.status === 'online' ? `${fn.latency}ms` : 'Offline'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-surface-2)', borderRadius: 'var(--radius)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
          Data Integrity Notice
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          These metrics are fetched in real-time from the production Supabase PostgreSQL instance via the `@supabase/ssr` server client. Row-Level Security (RLS) is bypassed securely using the service role on the server specifically for this admin dashboard, ensuring accurate global counts without exposing keys to the client.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, status }: { title: string, value: string | number, subtitle: string, status: 'online' | 'warning' | 'offline' }) {
  const statusColors = {
    online: '#10b981',
    warning: '#f59e0b',
    offline: '#ef4444'
  };

  return (
    <div style={{ padding: 20, background: 'var(--bg-surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{title}</div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColors[status] }} title={`Status: ${status}`} />
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{subtitle}</div>
    </div>
  );
}
