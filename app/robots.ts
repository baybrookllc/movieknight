import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Served at /robots.txt. Declares crawl policy and points crawlers at the
// sitemap so the individual title-detail pages get discovered at scale.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Authenticated, user-specific areas have no crawlable value and mirror
      // the protected-route list in proxy.ts.
      disallow: [
        '/api/',
        '/for-you',
        '/calendar',
        '/mood',
        '/lists',
        '/list/',
        '/friends',
        '/messages',
        '/notifications',
        '/profile',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
