// Pure, dependency-free browse-filter helpers.
//
// Extracted from components/BrowseClient.tsx so the filter logic — which had
// shipped two real bugs (a truthy-string leak that broke the "Clear all"
// button, and arrow-key hijacking of text inputs; see
// ADAM_DOCS/movieknight-audit-report.md §4/§8) — is unit-testable without
// rendering the full client component or mocking Supabase.

export interface FilterState {
  format: string;
  minRating: number;
  yearFrom: string;
  yearTo: string;
  country: string;
  language: string;
  cvrs: string;
  runtime: string;
  genres: number[];
  platforms: number[];
}

export const DEFAULT_FILTERS: FilterState = {
  format: '', minRating: 0, yearFrom: '', yearTo: '',
  country: '', language: '', cvrs: '', runtime: '', genres: [], platforms: [],
};

export const BROWSE_PAGE_SIZE = 24;

/**
 * True when any browse filter is active. Returns a real boolean.
 *
 * Several FilterState fields (format, yearFrom, language, …) are strings, so a
 * naive `f.format || f.minRating > 0 || …` chain evaluates to a truthy *string*
 * (e.g. 'movie'), not a boolean. That value previously flowed straight into a
 * `{hasActiveFilters || … && <button/>}` JSX expression, where — because `&&`
 * binds tighter than `||` — it both suppressed the "Clear all" button whenever a
 * filter was set and could render a raw filter string as stray page text.
 * Coercing to a boolean here removes the footgun at the source.
 */
export function computeHasActiveFilters(f: FilterState): boolean {
  return Boolean(
    f.format || f.minRating > 0 || f.yearFrom || f.yearTo ||
    f.genres.length > 0 || f.runtime || f.language || f.country ||
    f.cvrs || f.platforms.length > 0,
  );
}

/**
 * True for elements that own their own keyboard handling (text entry, selects,
 * contenteditable). The results-grid arrow-key navigation must bail out when
 * one of these is focused, otherwise it steals ArrowLeft/ArrowRight from the
 * search box's caret and calls preventDefault() on it.
 */
export function isTextInputTarget(el: EventTarget | null): boolean {
  if (!el || typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  // Fall back to the attribute — `isContentEditable` isn't implemented in all
  // environments (e.g. jsdom), and a bare `|| el.isContentEditable` would also
  // leak `undefined` out of this function instead of a strict boolean.
  const attr = el.getAttribute('contenteditable');
  return attr !== null && attr !== 'false';
}

/** Build the parameter object for the `browse_titles` Postgres RPC. */
export function buildBrowseParams(
  f: FilterState,
  currentOffset: number,
  userFilterTriggers: boolean,
  userId?: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    p_limit: BROWSE_PAGE_SIZE + 1, p_offset: currentOffset,
    p_media_type: f.format || null,
    p_genre_ids: f.genres.length > 0 ? f.genres : null,
    p_min_rating: f.minRating || 0,
    p_year_from: f.yearFrom ? parseInt(f.yearFrom, 10) : null,
    p_year_to: f.yearTo ? parseInt(f.yearTo, 10) : null,
    p_country: f.country || null,
    p_cvrs: f.cvrs || null,
    p_language: f.language || null,
    p_platform_ids: f.platforms.length > 0 ? f.platforms : null,
    p_runtime_min: null, p_runtime_max: null,
    // Trigger warning filtering
    p_user_id: userFilterTriggers && userId ? userId : null,
    p_filter_hidden_triggers: userFilterTriggers && !!userId,
  };
  switch (f.runtime) {
    case 'short':        params.p_runtime_max = 89; break;
    case 'medium':       params.p_runtime_min = 90; params.p_runtime_max = 120; break;
    case 'long':         params.p_runtime_min = 121; break;
    case 'series-short': params.p_runtime_max = 29; break;
    case 'series-long':  params.p_runtime_min = 45; break;
  }
  return params;
}
