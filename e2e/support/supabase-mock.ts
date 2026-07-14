import type { Page, Route } from '@playwright/test';

/**
 * Deterministic Supabase interception for the offline e2e tier.
 *
 * Registers a catch-all route on every `*.supabase.co` request so the suite
 * makes no real network calls. Known endpoints (auth, edge functions) get
 * purpose-built fixtures; everything else (PostgREST selects, RPCs) resolves
 * to an empty-but-valid array so the app renders without erroring.
 *
 * Call this BEFORE `page.goto(...)`.
 */

export interface SearchResultFixture {
  id: string;
  title: string;
  media_type?: 'movie' | 'tv';
  release_date?: string;
  vote_average?: number;
  poster_path?: string | null;
}

type AuthMode = 'none' | 'success' | 'invalid';

export interface MockOptions {
  /** How the auth (token / signup) endpoint should respond. Default 'none'. */
  auth?: AuthMode;
  /** Results returned by the search edge functions. Default []. */
  searchResults?: SearchResultFixture[];
}

/** A well-formed (but fake) GoTrue session, enough for supabase-js to accept it. */
function fakeSession() {
  return {
    access_token: 'e2e-fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999999999,
    refresh_token: 'e2e-fake-refresh-token',
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { display_name: 'E2E User' },
      identities: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  };
}

/** GoTrue's invalid-credentials error shape (covers old + new supabase-js parsing). */
function invalidAuthBody() {
  return {
    code: 400,
    error: 'invalid_grant',
    error_code: 'invalid_credentials',
    error_description: 'Invalid login credentials',
    msg: 'Invalid login credentials',
    message: 'Invalid login credentials',
  };
}

export async function mockSupabase(page: Page, opts: MockOptions = {}): Promise<void> {
  const auth = opts.auth ?? 'none';
  const searchResults = opts.searchResults ?? [];

  await page.route('**/*.supabase.co/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    // --- GoTrue auth ---
    if (path.includes('/auth/v1/token') || path.includes('/auth/v1/signup')) {
      return auth === 'invalid'
        ? json(400, invalidAuthBody())
        : json(200, fakeSession());
    }
    if (path.includes('/auth/v1/')) {
      // getUser / logout / recover / etc. — harmless empty success.
      return json(200, {});
    }

    // --- Edge functions (tmdb-cache, semantic-search) ---
    if (path.includes('/functions/v1/')) {
      return json(200, { results: searchResults });
    }

    // --- PostgREST selects + RPCs (genres, streaming_platforms, browse_titles…) ---
    return json(200, []);
  });
}
