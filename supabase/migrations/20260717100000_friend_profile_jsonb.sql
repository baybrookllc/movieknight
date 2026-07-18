-- ═══════════════════════════════════════════════════════════════
-- FRIEND PROFILE — return the object shape the client actually reads
-- The original get_friend_profile returned a TABLE of watch-history
-- rows, but app/(app)/profile/[userId]/page.tsx reads
-- { display_name, avatar_id, recent_titles } — so the profile header
-- rendered blank and "Recently Watched" never showed. Rebuilt as a
-- single jsonb object (one round trip, friendship guard preserved).
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_friend_profile(uuid);

CREATE FUNCTION get_friend_profile(p_friend_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'display_name', p.display_name,
    'avatar_id',    p.avatar_id,
    'recent_titles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           rt.title_id,
               'title',        rt.title,
               'poster_path',  rt.poster_path,
               'media_type',   rt.media_type,
               'release_date', rt.release_date,
               'status',       rt.status
             ) ORDER BY rt.watched_at DESC NULLS LAST)
      FROM (
        SELECT wh.title_id, t.title, t.poster_path, t.media_type,
               t.release_date, wh.status, wh.watched_at
        FROM watch_history wh
        JOIN titles t ON t.id = wh.title_id
        WHERE wh.user_id = p_friend_id
          AND wh.episode_season IS NULL
          AND wh.status <> 'not_interested'
        ORDER BY wh.watched_at DESC NULLS LAST
        LIMIT 12
      ) rt
    ), '[]'::jsonb)
  )
  FROM profiles p
  WHERE p.id = p_friend_id
    AND are_friends(auth.uid(), p_friend_id);
$$;

-- Personal data behind a friendship check — authenticated only.
REVOKE EXECUTE ON FUNCTION get_friend_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_friend_profile(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
