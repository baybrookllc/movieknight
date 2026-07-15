'use client';

const cardStyle: React.CSSProperties = {
  padding: 24,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

const ArchitectureNode = ({ name, tech, biz, children }: { name: string, tech: string, biz: string, children?: React.ReactNode }) => (
  <div style={{ paddingLeft: 16, borderLeft: '1px solid var(--border)', marginTop: 8 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 15, fontFamily: 'monospace', color: 'var(--accent)', minWidth: 160 }}>
        {name}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text)' }}><strong>Tech:</strong> {tech}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}><strong>Biz:</strong> {biz}</div>
      </div>
    </div>
    {children && <div style={{ marginTop: 8 }}>{children}</div>}
  </div>
);

export default function ArchitectureTab() {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 20 }}>
        Codebase Map
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ArchitectureNode 
          name="app/" 
          tech="Next.js App Router root. Contains route handlers, server components, and layout definitions."
          biz="The core structural shell defining the public and private areas of the application."
        >
          <ArchitectureNode 
            name="(app)/" 
            tech="Authenticated/Protected routes. Uses layout.tsx to wrap pages in AuthProvider and Sidebar."
            biz="The logged-in user experience (Dashboard, Lists, Search, Profiles)."
          />
          <ArchitectureNode 
            name="(public)/" 
            tech="Unauthenticated routes (Login, Signup)."
            biz="The onboarding flow where users sign up before accessing the main app."
          />
          <ArchitectureNode 
            name="api/" 
            tech="Next.js Route Handlers (REST endpoints) for proxies, auth, and webhook processing."
            biz="Backend connective tissue for third-party services like Stripe webhooks."
          />
        </ArchitectureNode>

        <ArchitectureNode 
          name="components/" 
          tech="React functional components, mostly 'use client' directives for interactivity."
          biz="The building blocks of the UI. Buttons, cards, modals, and specialized views."
        >
          <ArchitectureNode 
            name="BrowseClient.tsx" 
            tech="Client-side state manager for search queries, 8-filter system, and pagination."
            biz="The engine powering the movie/TV discovery experience."
          />
          <ArchitectureNode 
            name="TriggerWarnings.tsx" 
            tech="Fetches and renders DTDD (DoesTheDogDie) data based on user preferences."
            biz="The safety feature that hides/flags content based on user trauma triggers."
          />
        </ArchitectureNode>

        <ArchitectureNode 
          name="lib/" 
          tech="Shared utilities, type definitions, and centralized configuration."
          biz="The underlying logic that ensures consistency across the app."
        >
          <ArchitectureNode 
            name="store.ts" 
            tech="Zustand global state (shopping cart, optimistic UI updates)."
            biz="Keeps the user's current session snappy and responsive."
          />
          <ArchitectureNode 
            name="supabase-server.ts" 
            tech="SSR-compatible Supabase clients for trusted service-role mutations."
            biz="Ensures secure, server-side data access without exposing keys."
          />
        </ArchitectureNode>

        <ArchitectureNode 
          name="supabase/" 
          tech="Database configuration, migrations, and serverless compute layer."
          biz="The heart of the application's data and specialized operations."
        >
          <ArchitectureNode 
            name="migrations/" 
            tech="SQL files tracking schema evolution (e.g., 20260712000001_commerce_schema.sql)."
            biz="The audit trail of how our data structures have evolved over time."
          />
          <ArchitectureNode 
            name="functions/" 
            tech="Deno Edge Functions deployed via Supabase CLI."
            biz="Scalable, on-demand code running close to the user."
          >
            <ArchitectureNode 
              name="semantic-search" 
              tech="Takes text, embeds it via OpenAI, and queries pgvector via match_titles RPC."
              biz="The 'vibe' search feature finding movies based on mood descriptions."
            />
            <ArchitectureNode 
              name="tmdb-cache" 
              tech="Proxies TMDB API requests with an in-memory Map rate limiter."
              biz="Saves money and prevents API quota exhaustion by caching movie data."
            />
          </ArchitectureNode>
        </ArchitectureNode>
      </div>
    </div>
  );
}
