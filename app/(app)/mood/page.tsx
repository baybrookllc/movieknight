'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ── Mood dimensions ───────────────────────────────────────────── */
const DIMS = [
  { key: 'mindbending', label: 'Mind-bending', emoji: '🤯', query: 'mind-blowing psychological complex' },
  { key: 'emotional',   label: 'Emotional',    emoji: '💔', query: 'emotional heartfelt moving drama' },
  { key: 'funny',       label: 'Funny',        emoji: '😂', query: 'hilarious comedy laugh funny' },
  { key: 'action',      label: 'Action',       emoji: '⚡', query: 'action intense thrilling excitement' },
  { key: 'romantic',    label: 'Romantic',     emoji: '💕', query: 'romantic love story date night' },
];

const N = DIMS.length;
const CX = 200, CY = 200, R = 150;

// Pentagon vertex positions
function vertex(i: number, r: number) {
  const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function buildPolygonPoints(values: number[]) {
  return values.map((v, i) => {
    const pt = vertex(i, v * R);
    return `${pt.x},${pt.y}`;
  }).join(' ');
}

export default function MoodPage() {
  const router = useRouter();
  const [values, setValues] = useState<number[]>(DIMS.map(() => 0.5));
  const [dragging, setDragging] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert SVG coords to value (0–1)
  const coordToValue = useCallback((clientX: number, clientY: number, dimIdx: number) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 400 / rect.width;
    const scaleY = 400 / rect.height;
    const sx = (clientX - rect.left) * scaleX;
    const sy = (clientY - rect.top) * scaleY;
    // Project onto the radial line for this dimension
    const angle = (Math.PI * 2 * dimIdx) / N - Math.PI / 2;
    const dx = sx - CX, dy = sy - CY;
    const proj = (dx * Math.cos(angle) + dy * Math.sin(angle)) / R;
    return Math.max(0.05, Math.min(1, proj));
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging === null) return;
    const v = coordToValue(e.clientX, e.clientY, dragging);
    setValues(prev => { const next = [...prev]; next[dragging] = v; return next; });
  }, [dragging, coordToValue]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragging === null) return;
    e.preventDefault();
    const t = e.touches[0];
    const v = coordToValue(t.clientX, t.clientY, dragging);
    setValues(prev => { const next = [...prev]; next[dragging] = v; return next; });
  }, [dragging, coordToValue]);

  const handleSearch = () => {
    const parts = DIMS
      .filter((_, i) => values[i] > 0.2)
      .sort((a, b) => values[DIMS.indexOf(b)] - values[DIMS.indexOf(a)])
      .map((d, i) => {
        const strength = values[DIMS.indexOf(d)];
        if (strength > 0.75) return d.query.split(' ').slice(0, 3).join(' ');
        if (strength > 0.4) return d.query.split(' ')[0];
        return '';
      })
      .filter(Boolean);
    const q = parts.join(' ');
    router.push(`/browse?q=${encodeURIComponent(q)}`);
  };

  const handleReset = () => setValues(DIMS.map(() => 0.5));

  // Guide polygon (faded background)
  const guidePoints = DIMS.map((_, i) => { const pt = vertex(i, R); return `${pt.x},${pt.y}`; }).join(' ');

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Mood Explorer</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Drag the handles to shape your mood. The closer to a point, the more that dimension influences your picks.
        </p>
      </div>

      {/* Snowflake SVG */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
        <svg
          ref={svgRef}
          viewBox="0 0 400 400"
          style={{ width: '100%', maxWidth: 400, touchAction: 'none', cursor: dragging !== null ? 'grabbing' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setDragging(null)}
          onMouseLeave={() => setDragging(null)}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setDragging(null)}
        >
          {/* Grid rings */}
          {[0.25, 0.5, 0.75, 1].map(r => (
            <polygon
              key={r}
              points={DIMS.map((_, i) => { const pt = vertex(i, r * R); return `${pt.x},${pt.y}`; }).join(' ')}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          ))}

          {/* Axis lines */}
          {DIMS.map((_, i) => {
            const outer = vertex(i, R);
            return (
              <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y}
                stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            );
          })}

          {/* Guide polygon (outer) */}
          <polygon points={guidePoints} fill="rgba(65,88,208,0.04)" stroke="rgba(65,88,208,0.2)" strokeWidth={1} />

          {/* Active polygon */}
          <polygon
            points={buildPolygonPoints(values)}
            fill="rgba(200,80,192,0.15)"
            stroke="url(#grad)"
            strokeWidth={2}
            style={{ transition: dragging !== null ? 'none' : 'all 0.15s' }}
          />

          {/* Gradient def */}
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4158D0" />
              <stop offset="50%" stopColor="#C850C0" />
              <stop offset="100%" stopColor="#FF2E63" />
            </linearGradient>
          </defs>

          {/* Drag handles + labels */}
          {DIMS.map((dim, i) => {
            const handle = vertex(i, values[i] * R);
            const label = vertex(i, R + 28);
            const isActive = values[i] > 0.5;
            return (
              <g key={dim.key}>
                {/* Outer label */}
                <text
                  x={label.x} y={label.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={13} fontWeight={isActive ? 700 : 400}
                  fill={isActive ? '#fff' : 'rgba(255,255,255,0.5)'}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {dim.emoji} {dim.label}
                </text>

                {/* Handle */}
                <circle
                  cx={handle.x} cy={handle.y} r={10}
                  fill={isActive ? '#FF2E63' : 'var(--bg-surface-2)'}
                  stroke={isActive ? '#fff' : 'rgba(255,255,255,0.3)'}
                  strokeWidth={2}
                  style={{ cursor: 'grab', transition: dragging === i ? 'none' : 'all 0.15s' }}
                  onMouseDown={e => { e.preventDefault(); setDragging(i); }}
                  onTouchStart={e => { e.preventDefault(); setDragging(i); }}
                />
              </g>
            );
          })}

          {/* Center dot */}
          <circle cx={CX} cy={CY} r={4} fill="rgba(255,255,255,0.2)" />
        </svg>
      </div>

      {/* Intensity bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {DIMS.map((dim, i) => (
          <div key={dim.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>{dim.emoji}</span>
            <span style={{ fontSize: 13, width: 100, flexShrink: 0, color: values[i] > 0.5 ? 'var(--text)' : 'var(--text-muted)' }}>
              {dim.label}
            </span>
            <div style={{ flex: 1, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${values[i] * 100}%`,
                background: 'linear-gradient(90deg, #4158D0, #C850C0, #FF2E63)',
                borderRadius: 3,
                transition: dragging === i ? 'none' : 'width 0.15s',
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }}>
              {Math.round(values[i] * 100)}%
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={handleSearch} style={{ flex: 1, justifyContent: 'center', fontSize: 14 }}>
          Find Matches
        </button>
        <button className="btn btn-ghost" onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );
}
