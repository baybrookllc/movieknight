-- =============================================================================
-- Social RPCs — Final corrections (informed by schema dump)
-- Key findings:
--   - watch_history uses episode_season (not episode_number) + watched_at
--   - status values: 'want_to_watch' | 'watching' | 'watched' | 'dropped' | 'not_interested'
--   - profiles has both avatar_id and avatar_url; friend functions use avatar_id
--   - friend_requests is in public; pattern: WHERE ... AND status = 'accepted'
--   - Matches existing function pattern: LANGUAGE sql STABLE SECURITY DEFINER (no SET search_path)
-- =============================================================================


-- ── Fix get_friends_watching (was stub) ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_friends_watching(p_limit int DEFAULT 6)
RETURNS TABLE(user_id uuid, display_name text, avatar_id text,
              title_id text, title text, poster_path text,
              status text, rating int, watched_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, p.display_name, p.avatar_id,
         wh.title_id, t.title, t.poster_path,
         wh.status, wh.rating, wh.watched_at
  FROM watch_history wh
  JOIN profiles p ON p.id = wh.user_id
  JOIN titles   t ON t.id = wh.title_id
  WHERE wh.user_id IN (
    SELECT CASE WHEN sender_id = auth.uid() THEN receiver_id ELSE sender_id END
    FROM friend_requests
    WHERE (sender_id = auth.uid() OR receiver_id = auth.uid())
      AND status = 'accepted'
  )
    AND wh.episode_season IS NULL
    AND wh.status <> 'not_interested'
    AND wh.watched_at > now() - INTERVAL '7 days'
  ORDER BY wh.watched_at DESC
  LIMIT p_limit;
$$;


-- ── Fix get_online_friends (was stub) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION get_online_friends()
RETURNS TABLE(user_id uuid, display_name text, avatar_id text,
              last_seen timestamptz, is_online boolean)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, p.display_name, p.avatar_id, p.last_seen,
         (p.last_seen > now() - INTERVAL '15 minutes')
  FROM profiles p
  WHERE p.id IN (
    SELECT CASE WHEN sender_id = auth.uid() THEN receiver_id ELSE sender_id END
    FROM friend_requests
    WHERE (sender_id = auth.uid() OR receiver_id = auth.uid())
      AND status = 'accepted'
  )
    AND p.last_seen > now() - INTERVAL '24 hours'
  ORDER BY p.last_seen DESC
  LIMIT 10;
$$;


-- ── Fix get_friends_lists (was stub) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_friends_lists(p_limit int DEFAULT 4)
RETURNS TABLE(id uuid, title text, description text,
              owner_id uuid, owner_name text, owner_avatar text,
              like_count bigint, item_count bigint, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cl.id, cl.title, cl.description, cl.owner_id,
         p.display_name, p.avatar_url,
         COUNT(DISTINCT ll.user_id)::bigint,
         COUNT(DISTINCT li.id)::bigint,
         cl.created_at
  FROM custom_lists cl
  JOIN  profiles  p  ON p.id       = cl.owner_id
  LEFT JOIN list_likes ll ON ll.list_id = cl.id
  LEFT JOIN list_items  li ON li.list_id = cl.id
  WHERE cl.is_public = true
    AND cl.owner_id IN (
      SELECT CASE WHEN sender_id = auth.uid() THEN receiver_id ELSE sender_id END
      FROM friend_requests
      WHERE (sender_id = auth.uid() OR receiver_id = auth.uid())
        AND status = 'accepted'
    )
  GROUP BY cl.id, p.display_name, p.avatar_url
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
$$;


-- ── Fix episode_season + status filter in get_for_you_feed ────────────────
CREATE OR REPLACE FUNCTION get_for_you_feed(p_limit int DEFAULT 12)
RETURNS TABLE(id text, title text, poster_path text, backdrop_path text,
              media_type text, vote_average float, release_date date,
              match_pct int, friend_count bigint, friend_avatars text[])
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH
  user_genres AS (
    SELECT tg.genre_id, COUNT(*) AS n
    FROM public.watch_history wh
    JOIN public.title_genres tg ON tg.title_id = wh.title_id
    WHERE wh.user_id = auth.uid() AND wh.episode_season IS NULL
    GROUP BY tg.genre_id ORDER BY n DESC LIMIT 5
  ),
  top_n AS (SELECT GREATEST(COUNT(*), 1) AS n FROM user_genres),
  watched_ids AS (
    SELECT DISTINCT title_id FROM public.watch_history WHERE user_id = auth.uid()
  ),
  genre_overlap AS (
    SELECT tg.title_id, COUNT(*) AS overlap
    FROM public.title_genres tg
    WHERE tg.genre_id IN (SELECT genre_id FROM user_genres)
    GROUP BY tg.title_id
  )
  SELECT t.id, t.title, t.poster_path, t.backdrop_path, t.media_type,
         t.vote_average::float, t.release_date,
         LEAST(99, (
             COALESCE(go.overlap,0)::float / (SELECT n FROM top_n) * 55.0
           + t.vote_average::float / 10.0 * 45.0
         ))::int,
         0::bigint, ARRAY[]::text[]
  FROM public.titles t
  LEFT JOIN genre_overlap go ON go.title_id = t.id
  WHERE t.id NOT IN (SELECT title_id FROM watched_ids)
    AND t.poster_path IS NOT NULL AND t.vote_average::float >= 6.0
  ORDER BY 8 DESC, t.vote_average DESC
  LIMIT p_limit;
END; $$;


-- ── Fix status filter in get_upcoming_releases ('want_to_watch' not 'want')
CREATE OR REPLACE FUNCTION get_upcoming_releases(p_limit int DEFAULT 50)
RETURNS TABLE(id text, title text, poster_path text, media_type text,
              vote_average float, release_date date, popularity float, on_want_list boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.title, t.poster_path, t.media_type,
         t.vote_average::float, t.release_date, t.popularity::float,
         EXISTS (
           SELECT 1 FROM public.watch_history wh
           WHERE wh.user_id = auth.uid() AND wh.title_id = t.id
             AND wh.status = 'want_to_watch'
         )
  FROM public.titles t
  WHERE t.release_date BETWEEN CURRENT_DATE - INTERVAL '30 days'
                           AND CURRENT_DATE + INTERVAL '90 days'
    AND t.poster_path IS NOT NULL
  ORDER BY t.release_date ASC, t.popularity DESC
  LIMIT p_limit;
END; $$;


-- ── Restore get_trending_titles with watch_history (correct column names) ──
CREATE OR REPLACE FUNCTION get_trending_titles(p_limit int DEFAULT 20, p_media_type text DEFAULT NULL)
RETURNS TABLE(id text, title text, poster_path text, backdrop_path text,
              media_type text, vote_average float, release_date date,
              watch_count bigint, friend_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH activity AS (
    SELECT title_id, COUNT(DISTINCT user_id)::bigint AS watch_count
    FROM watch_history
    WHERE episode_season IS NULL
      AND watched_at > now() - INTERVAL '90 days'
    GROUP BY title_id
  )
  SELECT t.id, t.title, t.poster_path, t.backdrop_path, t.media_type,
         t.vote_average::float, t.release_date,
         COALESCE(a.watch_count, 0::bigint), 0::bigint
  FROM titles t
  LEFT JOIN activity a ON a.title_id = t.id
  WHERE (p_media_type IS NULL OR t.media_type = p_media_type)
    AND t.poster_path IS NOT NULL AND t.vote_average::float >= 6.5
  ORDER BY COALESCE(a.watch_count, 0) DESC, t.popularity DESC
  LIMIT p_limit;
$$;


-- ── Grants ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_friends_watching(int)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_online_friends()        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_friends_lists(int)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_for_you_feed(int)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_upcoming_releases(int)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_trending_titles(int,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
