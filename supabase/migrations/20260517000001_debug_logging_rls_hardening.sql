-- Hardening: prevent log forgery on debug tables
-- ------------------------------------------------------------------
-- The original 20260516000002 migration used WITH CHECK (true) on
-- INSERT policies and granted INSERT to anon. Combined with the
-- ingest route trusting userId from the request body, any client
-- could forge log rows attributed to any user.
--
-- This migration:
--   1. Replaces WITH CHECK (true) with auth.uid() = user_id OR user_id IS NULL
--   2. Revokes direct INSERT from anon (writes must flow through the
--      server-side /api/debug/ingest route, which uses service_role)

-- ── debug_logs ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "debug_logs_insert" ON debug_logs;
CREATE POLICY "debug_logs_insert" ON debug_logs FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- ── error_logs ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "error_logs_insert" ON error_logs;
CREATE POLICY "error_logs_insert" ON error_logs FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- ── network_metrics ───────────────────────────────────────────────
DROP POLICY IF EXISTS "network_metrics_insert" ON network_metrics;
CREATE POLICY "network_metrics_insert" ON network_metrics FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- ── performance_metrics ───────────────────────────────────────────
DROP POLICY IF EXISTS "performance_metrics_insert" ON performance_metrics;
CREATE POLICY "performance_metrics_insert" ON performance_metrics FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- ── Revoke direct INSERT from anon (server-side ingest only) ──────
-- Authenticated users keep INSERT permission, gated by the policies
-- above. Service role still bypasses RLS for the ingest route.
REVOKE INSERT ON debug_logs FROM anon;
REVOKE INSERT ON error_logs FROM anon;
REVOKE INSERT ON network_metrics FROM anon;
REVOKE INSERT ON performance_metrics FROM anon;
