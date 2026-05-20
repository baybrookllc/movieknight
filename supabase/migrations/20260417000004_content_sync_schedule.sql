-- ── Automated Content Sync ────────────────────────────────────────
-- Enables pg_cron + pg_net, then registers two weekly jobs that call
-- tmdb-cache?action=sync-new to pull new releases into the database.
--
-- Schedule: Monday + Friday at 03:00 UTC
--   Monday  → picks up the previous Friday's theatrical releases
--   Friday  → picks up mid-week drops and upcoming titles
--
-- The edge function is idempotent: it skips any title already cached
-- within the 7-day TTL, so only genuinely new titles are hydrated.
-- The existing DB webhook then auto-generates embeddings on INSERT.
-- ─────────────────────────────────────────────────────────────────

-- Enable extensions (safe to re-run; IF NOT EXISTS is a no-op)
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Allow cron to be called from the public schema
GRANT USAGE ON SCHEMA cron TO postgres;

-- Monday sync (03:00 UTC — picks up weekend + Friday releases)
SELECT cron.schedule(
  'sync-new-content-monday',
  '0 3 * * 1',
  $$
  SELECT net.http_get(
    url     := 'https://nwvliipxqedueskhxdym.supabase.co/functions/v1/tmdb-cache?action=sync-new',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dmxpaXB4cWVkdWVza2h4ZHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTkwNjAsImV4cCI6MjA4ODU3NTA2MH0._5XQeRRlNjvCegnC-n9p3mMmPYdbITESV5vojoHF4yg'
    )
  );
  $$
);

-- Friday sync (03:00 UTC — picks up mid-week releases)
SELECT cron.schedule(
  'sync-new-content-friday',
  '0 3 * * 5',
  $$
  SELECT net.http_get(
    url     := 'https://nwvliipxqedueskhxdym.supabase.co/functions/v1/tmdb-cache?action=sync-new',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dmxpaXB4cWVkdWVza2h4ZHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTkwNjAsImV4cCI6MjA4ODU3NTA2MH0._5XQeRRlNjvCegnC-n9p3mMmPYdbITESV5vojoHF4yg'
    )
  );
  $$
);
