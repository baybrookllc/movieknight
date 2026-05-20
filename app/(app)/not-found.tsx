import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center', padding: 32,
    }}>
      <div style={{ fontSize: 56 }}>🎬</div>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Page not found</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/home" className="btn btn-primary" style={{ marginTop: 8 }}>
        Back to Home
      </Link>
    </div>
  );
}
