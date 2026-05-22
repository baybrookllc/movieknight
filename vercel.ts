import { type VercelConfig } from '@vercel/config/v1';

/**
 * Vercel Project Configuration
 *
 * This replaces vercel.json with TypeScript for type safety,
 * dynamic configuration, and environment-aware settings.
 *
 * Vercel will auto-detect and use this file over vercel.json
 */
export const config: VercelConfig = {
  // Framework configuration
  framework: 'nextjs',
  buildCommand: 'npm run build',
  installCommand: 'npm install',
  outputDirectory: '.next',

  // Security & Cache Headers
  headers: [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'geolocation=(), microphone=(), camera=()',
        },
      ],
    },
    {
      source: '/public/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    {
      source: '/_next/static/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ],

  // Redirect non-www to www (if needed; uncomment to enable)
  // redirects: [
  //   {
  //     source: '/:path((?!www).*)',
  //     destination: 'https://www.movieknight.ca/:path',
  //     permanent: true,
  //   },
  // ],

  // Cron jobs (if using Vercel Crons)
  // crons: [
  //   {
  //     path: '/api/health',
  //     schedule: '*/5 * * * *',
  //   },
  // ],
};
