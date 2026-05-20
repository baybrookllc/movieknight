'use client';

import { useState } from 'react';

type Mode = 'why_watch' | 'similar' | 'taste' | 'free';

interface AskClaudeProps {
  /** If provided, anchors the assistant to this title for context. */
  titleId?: string;
  /** Which preset modes to show as quick-action buttons. Defaults to ['why_watch', 'similar']. */
  modes?: Mode[];
  /** Compact mode for embedding inline; defaults to false. */
  compact?: boolean;
}

const MODE_LABELS: Record<Mode, { label: string; icon: string }> = {
  why_watch: { label: 'Why I might like this', icon: '✨' },
  similar: { label: 'Find similar titles', icon: '🎬' },
  taste: { label: 'Analyze my taste', icon: '📊' },
  free: { label: 'Ask anything', icon: '💬' },
};

export default function AskClaude({
  titleId,
  modes = ['why_watch', 'similar'],
  compact = false,
}: AskClaudeProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [currentMode, setCurrentMode] = useState<Mode | null>(null);

  const ask = async (mode: Mode, question?: string) => {
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCurrentMode(mode);

    try {
      const body: Record<string, unknown> = { mode, question: question ?? mode };
      if (titleId) body.title_id = titleId;

      const res = await fetch('/api/claude/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
      } else {
        setAnswer(data.answer);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleFreeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeText.trim() || loading) return;
    ask('free', freeText.trim());
  };

  if (!open && compact) {
    return (
      <button
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}
        aria-label="Open Claude assistant"
      >
        <span>✨</span> Ask Claude
      </button>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
        marginTop: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>✨</span> Ask Claude
        </h3>
        {compact && (
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      {/* Quick-action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {modes.map((mode) => (
          <button
            key={mode}
            className="btn"
            disabled={loading}
            onClick={() => ask(mode)}
            style={{
              fontSize: 11,
              padding: '6px 12px',
              background: currentMode === mode && loading ? 'var(--accent)' : 'var(--bg)',
              color: currentMode === mode && loading ? '#fff' : 'var(--text)',
              opacity: loading && currentMode !== mode ? 0.5 : 1,
            }}
          >
            {MODE_LABELS[mode].icon} {MODE_LABELS[mode].label}
          </button>
        ))}
      </div>

      {/* Free-form question */}
      <form onSubmit={handleFreeSubmit} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder={titleId ? 'Ask about this title…' : 'Ask anything about movies & TV…'}
          maxLength={500}
          disabled={loading}
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--text)',
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !freeText.trim()}
          style={{ fontSize: 11, padding: '6px 14px' }}
        >
          {loading && currentMode === 'free' ? '…' : 'Send'}
        </button>
      </form>

      {/* Response */}
      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          Thinking…
        </div>
      )}
      {error && (
        <div
          style={{
            fontSize: 12,
            color: '#ff6b6b',
            background: 'rgba(255,107,107,0.1)',
            padding: 10,
            borderRadius: 6,
            border: '1px solid rgba(255,107,107,0.3)',
          }}
        >
          {error}
        </div>
      )}
      {answer && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--text)',
            background: 'var(--bg)',
            padding: 12,
            borderRadius: 6,
            border: '1px solid var(--border)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {answer}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-dim)' }}>
        Powered by Claude • Personalized based on your watch history
      </div>
    </div>
  );
}
