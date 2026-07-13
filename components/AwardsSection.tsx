'use client';

// ── AwardsSection ────────────────────────────────────────────────────────────
// Lazy-loaded by DetailClient via next/dynamic — never included in the
// initial page bundle; the ~6 KB of awards rendering code is only parsed
// after awardsData has loaded from the edge function and the user has a
// title with at least one win/nomination.

export interface AwardEntry {
  name: string;
  recipient?: string;
  year?: number;
  won?: boolean;
}

export interface AwardCategory {
  name: string;
  wins: AwardEntry[];
  nominations: AwardEntry[];
}

export interface AwardsData {
  total_wins: number;
  total_nominations: number;
  categories: AwardCategory[];
}

interface AwardsSectionProps {
  awardsData: AwardsData;
  awardsOpen: boolean;
  onToggle: () => void;
}

export default function AwardsSection({ awardsData, awardsOpen, onToggle }: AwardsSectionProps) {
  return (
    <section style={{ marginTop: 28 }}>
      {/* Clickable header */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: awardsOpen ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
          padding: '14px 18px', cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
        onFocus={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onBlur={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Awards</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {awardsData.total_wins > 0 && (
              <span>🏆 {awardsData.total_wins} win{awardsData.total_wins !== 1 ? 's' : ''}</span>
            )}
            {awardsData.total_wins > 0 && awardsData.total_nominations > 0 && ' · '}
            {awardsData.total_nominations > 0 && (
              <span>🎖️ {awardsData.total_nominations} nomination{awardsData.total_nominations !== 1 ? 's' : ''}</span>
            )}
          </span>
        </div>
        <span style={{
          fontSize: 13, color: 'var(--text-muted)',
          transition: 'transform 0.2s', display: 'inline-block',
          transform: awardsOpen ? 'rotate(180deg)' : 'none',
        }}>
          ▼
        </span>
      </button>

      {/* Expandable body */}
      {awardsOpen && (
        <div style={{
          border: '1px solid var(--border)', borderTop: 'none',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
          overflow: 'hidden',
        }}>
          {awardsData.categories.map((cat) => (
            <div key={cat.name} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{
                padding: '10px 16px', background: 'var(--bg-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {cat.wins.length > 0 && <span style={{ color: '#f5c518' }}>🏆 {cat.wins.length}</span>}
                  {cat.wins.length > 0 && cat.nominations.length > 0 && ' · '}
                  {cat.nominations.length > 0 && `${cat.nominations.length} nom.`}
                </span>
              </div>
              <div style={{ background: 'var(--bg-surface)' }}>
                {[
                  ...cat.wins.map(w => ({ ...w, won: true as const })),
                  ...cat.nominations,
                ].slice(0, 6).map((aw, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 16px',
                    borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                      {aw.won ? '🏆' : '🎖️'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{aw.name}</span>
                      {aw.recipient && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                          ({aw.recipient})
                        </span>
                      )}
                    </div>
                    {aw.year && (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                        {aw.year}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
