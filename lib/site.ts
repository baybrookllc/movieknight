// Canonical public origin for the site, used by robots.txt / sitemap.xml and
// any absolute-URL generation. Override with NEXT_PUBLIC_SITE_URL in non-prod
// environments; defaults to the production domain.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://movieknight.ca'
).replace(/\/+$/, '');
