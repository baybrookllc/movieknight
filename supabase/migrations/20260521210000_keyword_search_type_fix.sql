-- ═══════════════════════════════════════════════════════════════
-- KEYWORD SEARCH RPC — fix vote_average return type
--
-- The OR-match migration declared RETURNS TABLE (..., vote_average float)
-- but t.vote_average is numeric(3,1) on the underlying table. PostgREST
-- surfaced this as 400 / "Returned type numeric(3,1) does not match
-- expected type double precision in column 7".
--
-- Fix: explicitly cast t.vote_average::float in the SELECT.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════

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
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_or_query text;
  v_tsquery  tsquery;
BEGIN
  v_or_query := trim(regexp_replace(coalesce(p_query, ''), '[^a-zA-Z0-9\s]', ' ', 'g'));
  v_or_query := regexp_replace(v_or_query, '\s+', ' | ', 'g');

  IF v_or_query = '' OR v_or_query IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    v_tsquery := to_tsquery('english', v_or_query);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.overview,
    t.poster_path,
    t.media_type,
    t.release_date,
    t.vote_average::float,
    t.runtime,
    (
      ts_rank(
        to_tsvector('english', coalesce(t.title, '') || ' ' || coalesce(t.overview, '')),
        v_tsquery
      ) * (0.5 + (coalesce(t.vote_average::float, 0) / 20.0))
    )::float AS similarity
  FROM public.titles t
  WHERE
    to_tsvector('english', coalesce(t.title, '') || ' ' || coalesce(t.overview, ''))
      @@ v_tsquery
    AND (p_media_type IS NULL OR t.media_type = p_media_type)
    AND coalesce(t.vote_average::float, 0) >= 5.5
    AND t.poster_path IS NOT NULL
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_titles_by_keywords(text, text, int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
