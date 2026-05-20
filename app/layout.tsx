import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { Providers } from './providers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { validateEnv } from '@/lib/env';
import Script from 'next/script';
import './globals.css';

validateEnv();

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'CineStream — AI-Powered Movie & TV Discovery',
  description: 'Discover movies and TV shows with AI-powered semantic search, track what you watch, and see what friends are into.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'CineStream',
    description: 'AI-powered movie & TV discovery with semantic search and social features.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read nonce injected by proxy.ts middleware — used for CSP nonce-based scripts
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://nwvliipxqedueskhxdym.supabase.co" />
        <link rel="preconnect" href="https://api.dicebear.com" />
        <link rel="dns-prefetch" href="https://www.youtube-nocookie.com" />
      </head>
      <body className={inter.className} {...(nonce ? { 'data-nonce': nonce } : {})}>
        <Providers>
          {children}
        </Providers>
        {/* Vercel observability — zero-bundle-size, reports CWV + user timings */}
        <Analytics />
        <SpeedInsights />
        {/* Umami — cookieless, GDPR-compliant traffic analytics */}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && process.env.NEXT_PUBLIC_UMAMI_URL && (
          <Script
            src={`${process.env.NEXT_PUBLIC_UMAMI_URL}/script.js`}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="lazyOnload"
          />
        )}
        {/* Umami pixel — noscript fallback for JS-disabled browsers */}
        {process.env.NEXT_PUBLIC_UMAMI_PIXEL_URL && (
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={process.env.NEXT_PUBLIC_UMAMI_PIXEL_URL} width={1} height={1} alt="" />
          </noscript>
        )}
      </body>
    </html>
  );
}
