'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { reportClientError } from '@/lib/client-error-report';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[AppError]', error);
    reportClientError(error, { boundary: 'app' });
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 20,
      textAlign: 'center',
      padding: 32,
    }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360 }}>
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <button className="btn btn-ghost" onClick={() => router.push('/home')}>
          Go home
        </button>
      </div>
    </div>
  );
}
