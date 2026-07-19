// Guarded unwrap helpers for the matching/recommendation RPC results.
//
// These exist because MovieKnight's Supabase RPCs return three different shapes
// — a TABLE (PostgREST wraps in an array), a single jsonb object, or a scalar —
// and reading one as another has repeatedly shipped as a live bug (blank
// friend-profile header, "undefined% match", a doubled feed). Centralising the
// unwrap here lets lib/matching.test.ts lock each contract so the mis-cast
// can't silently return.

import type { ForYouResult, FriendProfile, TasteMatch } from './types';

/** get_for_you_feed RETURNS TABLE → PostgREST gives an array (or null on error). */
export function normalizeForYouFeed(data: unknown): ForYouResult[] {
  return Array.isArray(data) ? (data as ForYouResult[]) : [];
}

/**
 * get_friend_profile returns a single jsonb object, or null when the viewer and
 * target are not friends. An array (e.g. the blanket e2e mock returning `[]`, or
 * a TABLE-shaped RPC) is NOT a valid profile and must collapse to null — an empty
 * array is truthy and would otherwise render a header with `undefined` fields.
 */
export function normalizeFriendProfile(data: unknown): FriendProfile | null {
  if (!data || Array.isArray(data) || typeof data !== 'object') return null;
  return data as FriendProfile;
}

/** get_taste_match RETURNS TABLE → single row wrapped in an array; read `[0]`. */
export function normalizeTasteMatch(data: unknown): TasteMatch | null {
  return Array.isArray(data) ? ((data[0] as TasteMatch) ?? null) : null;
}
