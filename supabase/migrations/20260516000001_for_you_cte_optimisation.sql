-- NOTE: This file shares the `for_you_cte_optimisation` slug with the earlier
-- 20260515000006_for_you_cte_optimisation.sql. It is a duplicate that is RETAINED
-- DELIBERATELY — it is already applied on the remote database, so deleting it would
-- drift the migration history (see CHANGELOG v6.34). Do NOT "clean it up."
-- ═══════════════════════════════════════════════════════════════
-- FOR-YOU FEED CTE OPTIMISATION — Wave 6 follow-up
-- 1) Replace NOT IN anti-join with NOT EXISTS (safer, faster with NULLs)
-- 2) Add partial composite index on titles for the main query filter
-- 3) Add index on title_genres(genre_id) if not present (closes genre_overlap CTE scan)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Partial index on titles for the main feed filter ─────────
-- The for-you query always filters: poster_path IS NOT NULL AND vote_average >= 6.0
-- A partial index covering only those rows eliminates a full table scan.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'titles'
      AND indexname  = 'idx_titles_feed_eligible'
  ) THEN
    CREATE INDEX idx_titles_feed_eligible
      ON public.titles (vote_average DESC NULLS LAST)
      WHERE poster_path IS NOT NULL AND vote_average >= 6.0;
  END IF;
END $$;

-- ── 2. Composite index on title_genres(genre_id, title_id) ──────
-- Closes the genre_overlap CTE: WHERE genre_id IN (...) GROUP BY title_id
-- Covering index — no heap look-up needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'title_genres'
      AND indexname  = 'idx_title_genres_genre_title'
  ) THEN
    CREATE INDEX idx_title_genres_genre_title
      ON public.title_genres (genre_id, title_id);
  END IF;
END $$;

-- ── 3. Rewrite get_for_you_feed with NOT EXISTS anti-join ────────
-- NOT IN returns false for ALL rows when the subquery has even one NULL.
-- NOT EXISTS is NULL-safe and allows the planner to use the watch_history index.
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
    0::bigint,
    ARRAY[]::text[]
  FROM public.titles t
  LEFT JOIN genre_overlap go ON go.title_id = t.id
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

-- Refresh query planner stats
ANALYZE public.titles;
ANALYZE public.title_genres;

NOTIFY pgrst, 'reload schema';
