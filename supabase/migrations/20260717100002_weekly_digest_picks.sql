-- ═══════════════════════════════════════════════════════════════
-- WEEKLY DIGEST PICKS — set-based replacement for the per-user loop
-- in the notify-watchlist edge function, which ran 2 queries per user
-- (N+1), truncated watch history at 100 rows, and re-implemented the
-- For-You genre-overlap scoring in TypeScript with different weights.
-- One call now returns every eligible user's top picks, scored with
-- the same formula as get_for_you_feed (55% genre / 45% rating).
-- Service-role only: it spans all users' data.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_weekly_digest_picks(
  p_since    timestamptz,
  p_per_user int DEFAULT 5
)
RETURNS TABLE(
  user_id       uuid,
  display_name  text,
  top_genre_ids int[],
  title_id      text,
  title         text,
  overview      text,
  media_type    text,
  vote_average  float,
  score         int
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH
  eligible AS (
    SELECT p.id, p.display_name
    FROM   profiles p
    WHERE  p.notify_weekly = true
      AND  p.notification_email IS NOT NULL
  ),
  -- Each eligible user's top 5 genres by watch count (full history, no cap)
  user_genres AS (
    SELECT g.user_id, g.genre_id, g.n
    FROM (
      SELECT wh.user_id, tg.genre_id, COUNT(*) AS n,
             ROW_NUMBER() OVER (PARTITION BY wh.user_id ORDER BY COUNT(*) DESC) AS rn
      FROM   watch_history wh
      JOIN   eligible e     ON e.id = wh.user_id
      JOIN   title_genres tg ON tg.title_id = wh.title_id
      WHERE  wh.status = 'watched'
        AND  wh.episode_season IS NULL
      GROUP  BY wh.user_id, tg.genre_id
    ) g
    WHERE g.rn <= 5
  ),
  top_n AS (
    SELECT ug.user_id, GREATEST(MAX(ug.n), 1)::float AS n
    FROM   user_genres ug
    GROUP  BY ug.user_id
  ),
  user_top_genres AS (
    SELECT ug.user_id, ARRAY_AGG(ug.genre_id ORDER BY ug.n DESC)::int[] AS genre_ids
    FROM   user_genres ug
    GROUP  BY ug.user_id
  ),
  -- New high-rated titles in the window
  candidates AS (
    SELECT t.id, t.title, t.overview, t.media_type, t.vote_average::float AS vote_average
    FROM   titles t
    WHERE  t.cached_at >= p_since
      AND  t.vote_average::float >= 7.5
  ),
  -- Per (user, candidate) genre overlap with the user's top genres
  overlap AS (
    SELECT ug.user_id, tg.title_id, COUNT(*) AS overlap
    FROM   title_genres tg
    JOIN   user_genres ug ON ug.genre_id = tg.genre_id
    WHERE  tg.title_id IN (SELECT c.id FROM candidates c)
    GROUP  BY ug.user_id, tg.title_id
  ),
  scored AS (
    SELECT
      e.id           AS user_id,
      e.display_name,
      COALESCE(utg.genre_ids, ARRAY[]::int[]) AS top_genre_ids,
      c.id           AS title_id,
      c.title,
      c.overview,
      c.media_type,
      c.vote_average,
      -- Same formula as get_for_you_feed: 55% genre relevance + 45% rating
      LEAST(99.0,
          COALESCE(o.overlap, 0)::float / COALESCE(tn.n, 1) * 55.0
        + COALESCE(c.vote_average, 0) / 10.0 * 45.0
      ) AS score_f
    FROM eligible e
    CROSS JOIN candidates c
    LEFT JOIN top_n           tn  ON tn.user_id  = e.id
    LEFT JOIN user_top_genres utg ON utg.user_id = e.id
    LEFT JOIN overlap         o   ON o.user_id   = e.id AND o.title_id = c.id
    WHERE NOT EXISTS (
      SELECT 1 FROM watch_history wh
      WHERE  wh.user_id = e.id AND wh.title_id = c.id
    )
  ),
  ranked AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             PARTITION BY s.user_id
             ORDER BY s.score_f DESC, s.vote_average DESC, s.title_id
           ) AS rn
    FROM scored s
  )
  SELECT r.user_id, r.display_name, r.top_genre_ids,
         r.title_id, r.title, r.overview, r.media_type, r.vote_average,
         r.score_f::int
  FROM   ranked r
  WHERE  r.rn <= p_per_user
  ORDER  BY r.user_id, r.rn;
$$;

-- Cross-user data — service_role (edge functions) only.
REVOKE EXECUTE ON FUNCTION get_weekly_digest_picks(timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_weekly_digest_picks(timestamptz, int) TO service_role;

NOTIFY pgrst, 'reload schema';
