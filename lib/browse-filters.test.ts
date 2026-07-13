import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  computeHasActiveFilters,
  isTextInputTarget,
  buildBrowseParams,
  type FilterState,
} from './browse-filters';

describe('computeHasActiveFilters', () => {
  it('is false for the default (empty) filter state', () => {
    expect(computeHasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it('returns a real boolean (not a truthy string) when a string filter is set', () => {
    const result = computeHasActiveFilters({ ...DEFAULT_FILTERS, format: 'movie' });
    // The shipped bug: this expression evaluated to the string 'movie', which
    // broke the "Clear all" button's JSX render condition. Lock in a boolean.
    expect(result).toBe(true);
    expect(typeof result).toBe('boolean');
  });

  it('detects every individual filter dimension', () => {
    const cases: Array<Partial<FilterState>> = [
      { format: 'tv' },
      { minRating: 7 },
      { yearFrom: '2000' },
      { yearTo: '1979' }, // the "Classic (pre-1980)" preset sets only yearTo
      { genres: [28] },
      { runtime: 'short' },
      { language: 'en' },
      { country: 'CA' },
      { cvrs: 'PG' },
      { platforms: [1] },
    ];
    for (const partial of cases) {
      expect(computeHasActiveFilters({ ...DEFAULT_FILTERS, ...partial })).toBe(true);
    }
  });
});

describe('isTextInputTarget', () => {
  it('is true for text-entry elements', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTextInputTarget(document.createElement(tag))).toBe(true);
    }
  });

  it('is true for contenteditable elements', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(isTextInputTarget(div)).toBe(true);
  });

  it('is false for non-text elements and null', () => {
    expect(isTextInputTarget(document.createElement('div'))).toBe(false);
    expect(isTextInputTarget(document.createElement('a'))).toBe(false);
    expect(isTextInputTarget(null)).toBe(false);
  });
});

describe('buildBrowseParams', () => {
  it('maps default filters to null RPC params with paging', () => {
    const p = buildBrowseParams(DEFAULT_FILTERS, 0, false);
    expect(p.p_limit).toBe(25); // BROWSE_PAGE_SIZE + 1
    expect(p.p_offset).toBe(0);
    expect(p.p_media_type).toBeNull();
    expect(p.p_genre_ids).toBeNull();
    expect(p.p_filter_hidden_triggers).toBe(false);
    expect(p.p_user_id).toBeNull();
  });

  it('passes the user id only when trigger filtering is on AND a user exists', () => {
    const noUser = buildBrowseParams(DEFAULT_FILTERS, 0, true, undefined);
    expect(noUser.p_user_id).toBeNull();
    expect(noUser.p_filter_hidden_triggers).toBe(false);

    const withUser = buildBrowseParams(DEFAULT_FILTERS, 0, true, 'user-123');
    expect(withUser.p_user_id).toBe('user-123');
    expect(withUser.p_filter_hidden_triggers).toBe(true);
  });

  it('translates runtime buckets into min/max minutes', () => {
    expect(buildBrowseParams({ ...DEFAULT_FILTERS, runtime: 'short' }, 0, false).p_runtime_max).toBe(89);
    const medium = buildBrowseParams({ ...DEFAULT_FILTERS, runtime: 'medium' }, 0, false);
    expect(medium.p_runtime_min).toBe(90);
    expect(medium.p_runtime_max).toBe(120);
    expect(buildBrowseParams({ ...DEFAULT_FILTERS, runtime: 'long' }, 0, false).p_runtime_min).toBe(121);
  });
});
