-- Update browse_titles RPC to support streaming platform filtering

DROP FUNCTION IF EXISTS browse_titles(text,int[],float,int,int,text,text,text,int,int,int,int);

CREATE FUNCTION browse_titles(
  p_media_type   text    DEFAULT NULL,
  p_genre_ids    int[]   DEFAULT NULL,
  p_min_rating   float   DEFAULT 0,
  p_year_from    int     DEFAULT NULL,
  p_year_to      int     DEFAULT NULL,
  p_country      text    DEFAULT NULL,
  p_cvrs         text    DEFAULT NULL,
  p_language     text    DEFAULT NULL,
  p_runtime_min  int     DEFAULT NULL,
  p_runtime_max  int     DEFAULT NULL,
  p_platform_ids int[]   DEFAULT NULL,
  p_limit        int     DEFAULT 40,
  p_offset       int     DEFAULT 0
)
RETURNS TABLE (
  id             text,
  title          text,
  overview       text,
  poster_path    text,
  backdrop_path  text,
  release_date   date,
  vote_average   float,
  media_type     text,
  popularity     float,
  runtime        int,
  origin_country text,
  certification_ca text,
  original_language text
)
LANGUAGE sql STABLE AS $$
  SELECT
    t.id, t.title, t.overview, t.poster_path, t.backdrop_path,
    t.release_date, t.vote_average, t.media_type, t.popularity,
    t.runtime, t.origin_country, t.certification_ca, t.original_language
  FROM titles t
  WHERE
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
  ORDER BY t.popularity DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;
