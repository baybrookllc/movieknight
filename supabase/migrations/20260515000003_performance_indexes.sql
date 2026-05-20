-- ═══════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES — Wave 2
-- Closes gaps in browse_titles, get_for_you_feed, get_trending_titles
-- ═══════════════════════════════════════════════════════════════

-- title_genres lookups in browse_titles use title_id in EXISTS subquery
CREATE INDEX IF NOT EXISTS idx_title_genres_title_id
  ON public.title_genres (title_id);

-- watch_history filters by user_id + episode_season IS NULL repeatedly
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id
  ON public.watch_history (user_id);

CREATE INDEX IF NOT EXISTS idx_watch_history_user_episode
  ON public.watch_history (user_id, episode_season);

-- title_streaming_platforms lookups already indexed in 20260515 migration

-- titles ordering by popularity is the most common sort
CREATE INDEX IF NOT EXISTS idx_titles_popularity
  ON public.titles (popularity DESC NULLS LAST);

NOTIFY pgrst, 'reload schema';
