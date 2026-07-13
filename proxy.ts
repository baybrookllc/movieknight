import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = [
  '/for-you', '/calendar', '/mood',
  '/lists', '/list/', '/friends', '/messages', '/notifications', '/profile',
];

function buildCsp(nonce: string): string {
  // Turbopack dev mode requires eval() for HMR and source-map reconstruction.
  // unsafe-eval is only injected in development; production CSP remains strict.
  const isDev = process.env.NODE_ENV === 'development';
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Styles: self + inline (required by Next.js CSS-in-JS and inline styles)
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https://image.tmdb.org https://api.dicebear.com https://img.youtube.com`,
    `media-src 'self'`,
    // Frames: YouTube nocookie only
    `frame-src https://www.youtube-nocookie.com https://www.youtube.com`,
    // Connections: Supabase, analytics, and image CDNs
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.dicebear.com https://image.tmdb.org https://api-gateway.umami.dev https://*.posthog.com https://us.i.posthog.com`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through Next.js internals, API routes, and static assets without an
  // auth round-trip or CSP nonce. API routes do their own auth (getVerifiedUserId)
  // and return JSON that needs no CSP; static/metadata files need neither. This
  // mirrors the matcher below and is defence-in-depth for anything that slips
  // through it.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/manifest.json' ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml|webmanifest)$/.test(pathname)
  ) {
    return NextResponse.next({ request });
  }

  // Generate a fresh nonce for each request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p));

    if (!user && isProtected) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      const res = NextResponse.redirect(loginUrl);
      res.headers.set('Content-Security-Policy', csp);
      return res;
    }

    if (user && (pathname === '/login' || pathname === '/signup')) {
      const res = NextResponse.redirect(new URL('/home', request.url));
      res.headers.set('Content-Security-Policy', csp);
      return res;
    }

    // Forward nonce to layout via header so it can be applied to scripts
    supabaseResponse.headers.set('x-nonce', nonce);
    supabaseResponse.headers.set('Content-Security-Policy', csp);
    return supabaseResponse;

  } catch (err) {
    // FAIL CLOSED: redirect protected routes to login on auth errors
    console.error('[proxy] auth check failed:', err);
    const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p));
    if (isProtected) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'auth_check_failed');
      const res = NextResponse.redirect(loginUrl);
      res.headers.set('Content-Security-Policy', csp);
      return res;
    }
    const res = NextResponse.next({ request });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }
}

export const config = {
  // Run on page routes only. Exclude API routes (they authenticate themselves),
  // Next.js internals/static output, and public metadata files — none of which
  // need the per-request Supabase auth check or CSP nonce.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json).*)',
  ],
};
