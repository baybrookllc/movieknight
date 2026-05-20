-- Community rating aggregator
-- SECURITY DEFINER bypasses watch_history RLS so any user can read
-- the anonymised aggregate without seeing individual rows.
CREATE OR REPLACE FUNCTION public.get_community_rating(p_title_id text)
RETURNS TABLE (avg_stars numeric, rating_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    ROUND(AVG(rating::numeric) / 2.0, 1) AS avg_stars,
    COUNT(*)                              AS rating_count
  FROM watch_history
  WHERE title_id      = p_title_id
    AND rating        IS NOT NULL
    AND episode_season IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_rating(text) TO anon, authenticated;
