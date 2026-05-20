// Server-side environment variable validation.
// Call validateEnv() in server components or API routes to fail fast with
// a clear error rather than silently propagating undefined values.

const REQUIRED_SERVER_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const REQUIRED_PUBLIC_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

export function validateEnv(): void {
  if (typeof window !== 'undefined') return; // client-side: skip server-only vars

  const missing: string[] = [];

  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) missing.push(key);
  }
  for (const key of REQUIRED_PUBLIC_VARS) {
    if (!process.env[key]) missing.push(key);
  }

  if (missing.length === 0) return;

  const msg =
    `Missing required environment variables: ${missing.join(', ')}\n` +
    'Check your .env.local file or Vercel project settings.';

  // During static generation Next.js evaluates layouts to collect metadata.
  // Throwing here aborts the build even when vars will be present at runtime
  // (e.g. preview deployments with branch-scoped env vars). Warn instead so
  // the build completes; the missing vars will still cause runtime errors.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    console.warn('[validateEnv]', msg);
    return;
  }

  throw new Error(msg);
}
