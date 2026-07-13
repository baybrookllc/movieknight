-- ═══════════════════════════════════════════════════════════════
-- Security advisory remediation (Supabase linter, 2026-07-13)
--
-- Closes the ERROR/WARN security findings from get_advisors(security),
-- surfaced once Management-API access was restored. See
-- ADAM_DOCS/movieknight-audit-report.md (§6 / "Also outstanding").
--
--   1. rls_disabled_in_public (ERROR ×2) — `streaming_platforms` and
--      `title_streaming_platforms` were RLS-disabled in the API-exposed
--      `public` schema. Supabase's default privileges left anon/authenticated
--      with effective INSERT (verified: has_table_privilege = true), so the
--      tables were writable by anyone with the anon key. Enable RLS + a
--      public-READ policy (mirrors the existing `genres: public read`
--      convention). Reads are unchanged; writes now require the service role
--      (which bypasses RLS) — exactly how the server-side TMDB sync already
--      works. No client code writes these tables (grep-verified).
--
--   2. function_search_path_mutable (WARN ×45) — user-defined functions ran
--      with a role-mutable search_path, a search-path-injection surface for
--      the SECURITY DEFINER ones. Pin every non-extension public function to
--      `search_path = public` (identical to the 5 siblings already pinned,
--      e.g. handle_new_user — confirmed those are NOT flagged, so `public`
--      clears the lint). pgvector's functions are extension-owned and are
--      deliberately excluded (moving/altering them is out of scope).
--
-- Behaviour-preserving: name resolution already resolved against `public`
-- first, so pinning it changes nothing at runtime; only the mutable
-- search_path and the anon-write hole are closed. Idempotent / re-runnable.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. RLS on the streaming reference tables ─────────────────────
ALTER TABLE public.streaming_platforms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "streaming_platforms: public read" ON public.streaming_platforms;
CREATE POLICY "streaming_platforms: public read"
  ON public.streaming_platforms FOR SELECT USING (true);

ALTER TABLE public.title_streaming_platforms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "title_streaming_platforms: public read" ON public.title_streaming_platforms;
CREATE POLICY "title_streaming_platforms: public read"
  ON public.title_streaming_platforms FOR SELECT USING (true);

-- ── 2. Pin search_path on every non-extension public function ────
-- Self-scoping loop: touches only plain functions (prokind 'f') in `public`
-- that are NOT owned by an extension and do NOT already pin search_path.
-- This makes it correct regardless of exact function inventory drift.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      -- exclude functions owned by an extension (pgvector et al.)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      -- only those without an already-pinned search_path
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public',
      r.proname, r.args
    );
  END LOOP;
END $$;

-- ── 3. Defuse a latent token-leak policy on device_auth_codes ────
-- The 20260416000005 migration defines:
--   CREATE POLICY "anon can read code by pk" ... FOR SELECT USING (true)
-- Despite its name, USING (true) lets ANY anon read EVERY row — including the
-- access_token / refresh_token columns. It is (correctly) NOT present on the
-- live database today: the TV device-login flow reads device_auth_codes only
-- via the service role (see supabase/functions/tv-auth/index.ts), so no client
-- policy is needed. Drop it defensively — idempotent no-op against the current
-- live state — so a disaster-recovery replay of that migration can never
-- expose auth tokens. (Ties into the migration-history bootstrap gap noted in
-- ADAM_DOCS/movieknight-audit-report.md.)
DROP POLICY IF EXISTS "anon can read code by pk" ON public.device_auth_codes;
