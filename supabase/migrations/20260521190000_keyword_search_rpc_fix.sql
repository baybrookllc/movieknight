-- ═══════════════════════════════════════════════════════════════
-- KEYWORD SEARCH RPC FIX — re-applies get_titles_by_keywords
-- The earlier 20260520000001 migration was marked applied on remote
-- but PostgREST returns PGRST202 (function not in schema cache).
-- This fresh migration definitively re-creates the function and
-- forces a PostgREST schema cache reload via NOTIFY.
-- Idempotent: safe to apply even if the function already exists.
-- ═══════════════════════════════════════════════════════════════

-- 1. GIN index on tsvector(title, overview)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'titles'
      AND indexname  = 'idx_titles_fts_en'
  ) THEN
    CREATE INDEX idx_titles_fts_en
      ON public.titles
      USING GIN (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, ''))
      );
  END IF;
END $$;

-- 2. get_titles_by_keywords RPC
DROP FUNCTION IF EXISTS public.get_titles_by_keywords(text, text, int);

CREATE OR REPLACE FUNCTION public.get_titles_by_keywords(
  p_query      text,
  p_media_type text DEFAULT NULL,
  p_limit      int  DEFAULT 10
)
RETURNS TABLE (
  id           text,
  title        text,
  overview     text,
  poster_path  text,
  media_type   text,
  release_date date,
  vote_average float,
  runtime      int,
  similarity   float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.title,
    t.overview,
    t.poster_path,
    t.media_type,
    t.release_date,
    t.vote_average,
    t.runtime,
    ts_rank(
      to_tsvector('english', coalesce(t.title, '') || ' ' || coalesce(t.overview, '')),
      plainto_tsquery('english', p_query)
    )::float AS similarity
  FROM public.titles t
  WHERE
    to_tsvector('english', coalesce(t.title, '') || ' ' || coalesce(t.overview, ''))
      @@ plainto_tsquery('english', p_query)
    AND (p_media_type IS NULL OR t.media_type = p_media_type)
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_titles_by_keywords(text, text, int) TO anon, authenticated;

-- 3. Force PostgREST to reload schema cache so the new function is callable
NOTIFY pgrst, 'reload schema';
