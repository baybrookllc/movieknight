'use client';

const cardStyle: React.CSSProperties = {
  padding: 24,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 8,
};

export default function TechStackTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Business Verticals */}
      <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
        <h2 style={{ ...labelStyle, marginBottom: 16 }}>The 5 Core Business Verticals</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            { name: 'Tracking', desc: 'Watch status, ratings, and episode progress.' },
            { name: 'Discovery', desc: 'Semantic search by mood and 8-filter system.' },
            { name: 'Streaming', desc: 'Where to watch (TMDB provider integration).' },
            { name: 'Social', desc: 'Friends, custom lists, and activity feeds.' },
            { name: 'Commerce', desc: 'Physical media marketplace (Phase P0 Live).' },
          ].map(v => (
            <div key={v.name} style={{ padding: 16, background: 'var(--bg-surface-2)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--accent)' }}>{v.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Frontend Stack */}
      <div style={cardStyle}>
        <h2 style={labelStyle}>Frontend Layer</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
          <li><strong>Framework:</strong> Next.js 16.2.6 (App Router)</li>
          <li><strong>UI Library:</strong> React 19</li>
          <li><strong>Styling:</strong> Vanilla CSS (`globals.css`)</li>
          <li><strong>State Management:</strong> Zustand 4.4.1</li>
          <li><strong>Data Fetching:</strong> TanStack React Query & native fetch</li>
        </ul>
      </div>

      {/* Backend Stack */}
      <div style={cardStyle}>
        <h2 style={labelStyle}>Backend Layer</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
          <li><strong>Database:</strong> Supabase (PostgreSQL 15+)</li>
          <li><strong>Auth:</strong> Supabase Auth (JWT, email/password)</li>
          <li><strong>Compute:</strong> Supabase Edge Functions (Deno)</li>
          <li><strong>Vector DB:</strong> pgvector (1536 dims)</li>
          <li><strong>Hosting:</strong> Vercel Serverless Functions</li>
        </ul>
      </div>

      {/* External APIs & Tooling */}
      <div style={cardStyle}>
        <h2 style={labelStyle}>External Integrations</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
          <li><strong>Movie Data:</strong> TMDB API (Proxied & Cached)</li>
          <li><strong>AI Model:</strong> OpenAI `text-embedding-3-small`</li>
          <li><strong>AI Chat:</strong> Claude (Anthropic API via Edge)</li>
          <li><strong>Content Warnings:</strong> DoesTheDogDie.com (DTDD)</li>
          <li><strong>Analytics:</strong> Vercel Analytics, Speed Insights, PostHog</li>
        </ul>
      </div>

      {/* CI/CD & Testing */}
      <div style={cardStyle}>
        <h2 style={labelStyle}>Testing & CI/CD</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
          <li><strong>Unit Tests:</strong> Vitest (lib/ and components/)</li>
          <li><strong>E2E Tests:</strong> Playwright (Deterministic + Live tiers)</li>
          <li><strong>Deployment:</strong> GitHub Actions to Vercel</li>
          <li><strong>Migrations:</strong> Automated `supabase db push` on merge</li>
        </ul>
      </div>
    </div>
  );
}
