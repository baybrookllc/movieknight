-- ============================================================
--  Backfill Missing Embeddings (2026-05-08)
--  Generates embeddings for titles that don't have them yet
-- ============================================================

-- This migration triggers the embedding generation for all titles
-- without embeddings. It sends an HTTP request to the generate-embedding
-- edge function which will batch-process them.

-- Note: This is handled by the edge function, but we document it here
-- for reference. The actual invocation happens via:
--   POST /functions/v1/generate-embedding
--   Body: {"backfill": true, "limit": 500}
--
-- For manual verification, query:
SELECT COUNT(*) as titles_without_embeddings
FROM public.titles t
LEFT JOIN public.title_embeddings te ON t.id = te.title_id
WHERE te.title_id IS NULL;

-- If count > 0, titles are missing embeddings and will be processed
-- by the weekly cron job or manual embedding generation call.
