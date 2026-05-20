-- ============================================================
--  Setup pg_cron for seed-catalog Weekly Scheduling (2026-05-08)
--  Schedules: Every Monday at 2:00 AM UTC
-- ============================================================

-- IMPORTANT: Set your SERVICE_ROLE key before running:
-- In Supabase SQL Editor, run: ALTER SYSTEM SET app.service_role_key = 'your_service_role_key';
-- Then: SELECT pg_reload_conf();

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create the weekly cron job to invoke seed-catalog
SELECT cron.schedule(
  'invoke-seed-catalog-weekly',           -- Job name
  '0 2 * * 1',                            -- Monday at 2:00 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://nwvliipxqedueskhxdym.supabase.co/functions/v1/seed-catalog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  )
  $$
);

-- Verify the job was created
-- SELECT * FROM cron.job WHERE jobname = 'invoke-seed-catalog-weekly';
