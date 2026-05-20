import { VERSION, BUILD_DATE } from '@/lib/version';

export default function AppFooter() {
  return (
    <footer style={{
      gridColumn: '1 / -1', // span sidebar + main — true full-width footer
      gridRow: 3,
      borderTop: '1px solid var(--border)',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 11,
      color: 'var(--text-dim)',
      background: 'var(--bg)',
    }}>
      <span>StreamSocial</span>
      <span style={{ fontFamily: 'monospace', letterSpacing: '0.03em' }}>
        {VERSION} · {BUILD_DATE}
      </span>
    </footer>
  );
}
