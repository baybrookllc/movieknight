-- ═══════════════════════════════════════════════════════════════
-- FOR-YOU FEED — populate the friend-overlap columns
-- friend_count / friend_avatars were hardcoded to 0 / '{}' while the
-- For You page already renders them. Adds a friends CTE (accepted
-- friend_requests, same predicate as are_friends()) joined to
-- watch_history. friend_avatars carries avatar *seeds* (avatar_id,
-- falling back to the friend's user id) — the client builds DiceBear
-- URLs via getAvatarUrl(). Scoring and ordering are unchanged.
-- This is now the canonical definition of get_for_you_feed.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_for_you_feed(p_limit int DEFAULT 12)
RETURNS TABLE(
  id            text,
  title         text,
  poster_path   text,
  backdrop_path text,
  media_type    text,
  vote_average  float,
  release_date  date,
  match_pct     int,
  friend_count  bigint,
  friend_avatars text[]
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Step 1: user's top genres (max 5) by watch count
  user_genres AS (
    SELECT tg.genre_id, COUNT(*) AS n
    FROM   public.watch_history wh
    JOIN   public.title_genres  tg ON tg.title_id = wh.title_id
    WHERE  wh.user_id = auth.uid()
      AND  wh.episode_season IS NULL
    GROUP  BY tg.genre_id
    ORDER  BY n DESC
    LIMIT  5
  ),
  -- Step 2: denominator for match_pct normalisation
  top_n AS (
    SELECT GREATEST(MAX(n), 1)::float AS n FROM user_genres
  ),
  -- Step 3: genre overlap score per title (covers idx_title_genres_genre_title)
  genre_overlap AS (
    SELECT tg.title_id, COUNT(*) AS overlap
    FROM   public.title_genres tg
    WHERE  tg.genre_id IN (SELECT genre_id FROM user_genres)
    GROUP  BY tg.title_id
  ),
  -- Step 4: accepted friends of the current user
  friends AS (
    SELECT CASE WHEN fr.sender_id = auth.uid()
                THEN fr.receiver_id ELSE fr.sender_id END AS friend_id
    FROM   public.friend_requests fr
    WHERE  fr.status = 'accepted'
      AND  (fr.sender_id = auth.uid() OR fr.receiver_id = auth.uid())
  ),
  -- Step 5: per-title friend watch counts + up to 3 avatar seeds
  friend_watches AS (
    SELECT wh.title_id,
           COUNT(DISTINCT wh.user_id) AS friend_count,
           (ARRAY_AGG(DISTINCT COALESCE(p.avatar_id, wh.user_id::text)))[1:3] AS friend_avatars
    FROM   public.watch_history wh
    JOIN   friends f          ON f.friend_id = wh.user_id
    JOIN   public.profiles p  ON p.id = wh.user_id
    WHERE  wh.episode_season IS NULL
      AND  wh.status <> 'not_interested'
    GROUP  BY wh.title_id
  )
  SELECT
    t.id,
    t.title,
    t.poster_path,
    t.backdrop_path,
    t.media_type,
    t.vote_average::float,
    t.release_date,
    -- match_pct: 55% genre relevance + 45% rating quality, capped at 99
    LEAST(99, (
        COALESCE(go.overlap, 0)::float / (SELECT n FROM top_n) * 55.0
      + t.vote_average::float / 10.0 * 45.0
    ))::int,
    COALESCE(fw.friend_count, 0),
    COALESCE(fw.friend_avatars, ARRAY[]::text[])
  FROM public.titles t
  LEFT JOIN genre_overlap  go ON go.title_id = t.id
  LEFT JOIN friend_watches fw ON fw.title_id = t.id
  -- NOT EXISTS is NULL-safe and lets the planner use idx_watch_history_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.watch_history wh
    WHERE  wh.user_id  = auth.uid()
      AND  wh.title_id = t.id
  )
    AND t.poster_path  IS NOT NULL
    AND t.vote_average::float >= 6.0
  ORDER BY 8 DESC, t.vote_average DESC
  LIMIT p_limit;
END;
$$;

NOTIFY pgrst, 'reload schema';
