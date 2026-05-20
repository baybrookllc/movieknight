import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Auth-aware server client — reads cookies so it can act on behalf of the
 * signed-in user. Because it calls cookies(), Next.js marks the route as
 * dynamic and ISR/revalidate won't cache it.
 *
 * Use for: pages that need the user's identity (profile, lists, for-you).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from Server Component — cookies will be set by middleware
          }
        },
      },
    }
  );
}

/**
 * Cookie-free server client for public/shared data — does NOT call cookies(),
 * so Next.js can fully cache the page via ISR (revalidate export works).
 *
 * Use for: trending, calendar, mood, browse — pages showing the same data
 * to every visitor. Uses the anon key (RLS public-read tables only).
 */
export function createSupabasePublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Service-role client for trusted server-side mutations that need to bypass
 * RLS (e.g. /api/debug/ingest, /api/warmup). NEVER expose to a browser bundle.
 */
export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Extract the authenticated user's ID from the Supabase auth cookie.
 * Returns null if not authenticated or if an error occurs.
 * Used by API routes that need to verify the caller's identity.
 */
export async function getVerifiedUserId(): Promise<string | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const cookieStore = await cookies();
    const client = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    });
    const { data: { user } } = await client.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
