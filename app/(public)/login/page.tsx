'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  padding: '0 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.15s',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { mutate: login, isPending: loading, error } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => router.push('/home'),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    login();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 24,
    }}>
      {/* Logo */}
      <Link href="/" style={{ marginBottom: 40 }}>
        <span style={{
          fontSize: 22,
          fontWeight: 900,
          background: 'linear-gradient(135deg, #4158D0, #C850C0, #FF2E63)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '-0.5px',
        }}>
          CINESTREAM
        </span>
      </Link>

      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px 36px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.3px' }}>
          Welcome back
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
          Log in to your account to continue
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>
                Password
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--accent)', fontSize: 13, margin: 0 }}>{error.message}</p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', height: 44, marginTop: 4, fontSize: 14, borderRadius: 'var(--radius)' }}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
