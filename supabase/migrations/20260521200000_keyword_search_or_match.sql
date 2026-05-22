-- ═══════════════════════════════════════════════════════════════
-- KEYWORD SEARCH RPC — switch from AND to OR matching
--
-- The earlier function used plainto_tsquery which AND-joins all words.
-- For compound mood queries like "mind-blowing psychological mind-bending
-- thriller" no title contains ALL 4 words, so the function returned 0
-- rows. This broke SSR for every mood on the home page.
--
-- This migration rewrites the function to:
--   1. Strip non-alphanumerics from the query
--   2. Build an OR'd to_tsquery (word1 | word2 | word3 | …)
--   3. Rank by ts_rank * (vote_average / 10) to prioritise quality
--   4. Filter to titles with vote_average >= 5.5 and >= 50 votes worth of
--      weight to avoid garbage results topping the chart
-- Idempotent: DROP + CREATE OR REPLACE.
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
  -- Strip non-alphanumeric characters (keep spaces), trim, split on
  -- whitespace, then join with ' | ' for OR-style tsquery.
  -- Example: "mind-blowing psychological" -> "mind blowing psychological"
  --           -> "mind | blowing | psychological"
  v_or_query := trim(regexp_replace(coalesce(p_query, ''), '[^a-zA-Z0-9\s]', ' ', 'g'));
  v_or_query := regexp_replace(v_or_query, '\s+', ' | ', 'g');

  -- Guard: empty query
  IF v_or_query = '' OR v_or_query IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    v_tsquery := to_tsquery('english', v_or_query);
  EXCEPTION WHEN OTHERS THEN
    -- If user input still produces an invalid tsquery, return nothing
    -- rather than 500-ing the API call.
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
      ) * (0.5 + (coalesce(t.vote_average, 0) / 20.0))  -- vote-weighted rank
    )::float AS similarity
  FROM public.titles t
  WHERE
    to_tsvector('english', coalesce(t.title, '') || ' ' || coalesce(t.overview, ''))
      @@ v_tsquery
    AND (p_media_type IS NULL OR t.media_type = p_media_type)
    AND coalesce(t.vote_average, 0) >= 5.5
    AND t.poster_path IS NOT NULL  -- visual results only
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_titles_by_keywords(text, text, int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
