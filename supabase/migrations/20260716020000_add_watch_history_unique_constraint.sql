-- Add a UNIQUE NULLS NOT DISTINCT constraint to watch_history so that
-- Supabase upserts (ON CONFLICT) work correctly when episode_season and episode_number are NULL.
-- PostgreSQL 15+ supports NULLS NOT DISTINCT, ensuring (user_id, title_id, NULL, NULL)
-- is treated as a duplicate of an existing (user_id, title_id, NULL, NULL).

ALTER TABLE public.watch_history
  ADD CONSTRAINT watch_history_user_title_episode_key 
  UNIQUE NULLS NOT DISTINCT (user_id, title_id, episode_season, episode_number);
