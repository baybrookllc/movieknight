-- Add trigger warning filtering to browse_titles RPC
-- Allows filtering out titles with hidden trigger warnings based on user preferences

-- Ensure GIN index exists on dtdd_cache.topics for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_dtdd_cache_topics_gin
ON public.dtdd_cache USING GIN (topics);

-- Drop old function if it exists (using CASCADE to handle any dependencies)
DROP FUNCTION IF EXISTS browse_titles CASCADE;

CREATE FUNCTION browse_titles(
  p_media_type            text    DEFAULT NULL,
  p_genre_ids             int[]   DEFAULT NULL,
  p_min_rating            float   DEFAULT 0,
  p_year_from             int     DEFAULT NULL,
  p_year_to               int     DEFAULT NULL,
  p_country               text    DEFAULT NULL,
  p_cvrs                  text    DEFAULT NULL,
  p_language              text    DEFAULT NULL,
  p_runtime_min           int     DEFAULT NULL,
  p_runtime_max           int     DEFAULT NULL,
  p_platform_ids          int[]   DEFAULT NULL,
  p_limit                 int     DEFAULT 40,
  p_offset                int     DEFAULT 0,
  p_user_id               uuid    DEFAULT NULL,
  p_filter_hidden_triggers boolean DEFAULT false
)
RETURNS TABLE (
  id              text,
  title           text,
  overview        text,
  poster_path     text,
  backdrop_path   text,
  release_date    date,
  vote_average    float,
  media_type      text,
  popularity      float,
  runtime         int,
  origin_country  text,
  certification_ca text,
  original_language text
)
LANGUAGE sql STABLE AS $$
  WITH filtered_titles AS (
    SELECT t.*
    FROM titles t
    LEFT JOIN dtdd_cache dc ON t.id = dc.title_id
    WHERE
      -- Existing filters (unchanged)
      (p_media_type IS NULL OR t.media_type = p_media_type)
      AND (p_min_rating = 0 OR t.vote_average >= p_min_rating)
      AND (p_year_from IS NULL OR EXTRACT(YEAR FROM t.release_date) >= p_year_from)
      AND (p_year_to   IS NULL OR EXTRACT(YEAR FROM t.release_date) <= p_year_to)
      AND (p_country   IS NULL OR t.origin_country = p_country)
      AND (p_cvrs      IS NULL OR t.certification_ca = p_cvrs)
      AND (p_language  IS NULL OR t.original_language = p_language)
      AND (p_runtime_min IS NULL OR t.runtime >= p_runtime_min)
      AND (p_runtime_max IS NULL OR t.runtime <= p_runtime_max)
      AND (p_genre_ids IS NULL OR EXISTS (
        SELECT 1 FROM title_genres tg
        WHERE tg.title_id = t.id AND tg.genre_id = ANY(p_genre_ids)
      ))
      AND (p_platform_ids IS NULL OR EXISTS (
        SELECT 1 FROM title_streaming_platforms tsp
        WHERE tsp.title_id = t.id AND tsp.platform_id = ANY(p_platform_ids)
      ))
      -- Trigger filtering: exclude titles with hidden triggers if enabled
      AND (
        NOT p_filter_hidden_triggers
        OR p_user_id IS NULL
        OR dc.title_id IS NULL  -- No trigger data
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(dc.topics) AS topic(obj)
          WHERE (topic.obj->>'topicKey') IN (
            SELECT topic_key
            FROM user_trigger_prefs
            WHERE user_id = p_user_id AND action = 'hide'
          )
        )
      )
  )
  SELECT
    ft.id, ft.title, ft.overview, ft.poster_path, ft.backdrop_path,
    ft.release_date, ft.vote_average, ft.media_type, ft.popularity,
    ft.runtime, ft.origin_country, ft.certification_ca, ft.original_language
  FROM filtered_titles ft
  ORDER BY ft.popularity DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

-- Ensure RLS is properly enabled on user_trigger_prefs
-- (already set up in 20260418000003, just confirming)
ALTER TABLE public.user_trigger_prefs ENABLE ROW LEVEL SECURITY;
