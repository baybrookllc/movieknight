import { describe, it, expect } from 'vitest';
import {
  normalizeForYouFeed,
  normalizeFriendProfile,
  normalizeTasteMatch,
} from './matching';
import type { ForYouResult, FriendProfile } from './types';

// These tests lock the client-side RPC-unwrap contracts for the three matching
// RPCs. Each `it` documents a shape that has (or would have) shipped as a live
// bug — the exact TABLE-vs-jsonb-vs-scalar mis-cast the v6.34 audit fixed.

describe('normalizeForYouFeed (get_for_you_feed RETURNS TABLE → array)', () => {
  it('passes a populated array through unchanged', () => {
    const rows = [{ id: 'movie:1', match_pct: 88 }] as unknown as ForYouResult[];
    expect(normalizeForYouFeed(rows)).toBe(rows);
  });

  it('collapses null / undefined (RPC error) to an empty array', () => {
    expect(normalizeForYouFeed(null)).toEqual([]);
    expect(normalizeForYouFeed(undefined)).toEqual([]);
  });

  it('never returns a non-array (guards a jsonb-object mis-shape)', () => {
    expect(normalizeForYouFeed({ id: 'movie:1' })).toEqual([]);
  });
});

describe('normalizeFriendProfile (get_friend_profile → jsonb object | null)', () => {
  const profile: FriendProfile = {
    display_name: 'Ada',
    avatar_id: 'seed-ada',
    recent_titles: [],
  };

  it('passes a jsonb profile object through unchanged', () => {
    expect(normalizeFriendProfile(profile)).toBe(profile);
  });

  it('maps a not-friends null to null', () => {
    expect(normalizeFriendProfile(null)).toBeNull();
  });

  it('maps an empty array to null (the blanket-mock / TABLE mis-shape)', () => {
    // The e2e mock historically returned `[]` for every RPC. `[]` is truthy, so
    // without this guard the header rendered with `display_name === undefined`.
    expect(normalizeFriendProfile([])).toBeNull();
    expect(normalizeFriendProfile([profile])).toBeNull();
  });
});

describe('normalizeTasteMatch (get_taste_match RETURNS TABLE → row[0] | null)', () => {
  it('unwraps the first row of the PostgREST-wrapped array', () => {
    const row = { compatibility_pct: 73, titles_in_common: 12 };
    expect(normalizeTasteMatch([row])).toEqual(row);
  });

  it('maps an empty result set to null (not "undefined% match")', () => {
    expect(normalizeTasteMatch([])).toBeNull();
  });

  it('maps null / a bare object to null (guards reading TABLE as object)', () => {
    expect(normalizeTasteMatch(null)).toBeNull();
    expect(normalizeTasteMatch({ compatibility_pct: 73 })).toBeNull();
  });
});
