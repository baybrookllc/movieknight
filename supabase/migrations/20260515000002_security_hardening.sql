-- ═══════════════════════════════════════════════════════════════
-- SECURITY HARDENING — Wave 1
-- 1) Ensure messages table exists + RLS
-- 2) Revoke anon grants from auth-dependent RPCs
-- 3) Tighten device_auth_codes RLS (drop public read)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Messages table + RLS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 5000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own messages"    ON public.messages;
DROP POLICY IF EXISTS "users send own messages"    ON public.messages;
DROP POLICY IF EXISTS "users update own messages"  ON public.messages;

CREATE POLICY "users read own messages" ON public.messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "users send own messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "users update own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- Add content length CHECK if table already existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'messages_content_check'
  ) THEN
    BEGIN
      ALTER TABLE public.messages
        ADD CONSTRAINT messages_content_check
        CHECK (char_length(content) > 0 AND char_length(content) <= 5000);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── 2. Revoke anon from auth-dependent RPCs ─────────────────────
REVOKE EXECUTE ON FUNCTION get_friends_watching(int)         FROM anon;
REVOKE EXECUTE ON FUNCTION get_online_friends()              FROM anon;
REVOKE EXECUTE ON FUNCTION get_friends_lists(int)            FROM anon;
REVOKE EXECUTE ON FUNCTION get_for_you_feed(int)             FROM anon;
REVOKE EXECUTE ON FUNCTION get_friend_notification_count()   FROM anon;

-- get_upcoming_releases + get_trending_titles can stay anon-readable
-- since they don't use auth.uid() — these power the landing/sidebar widgets.

-- ── 3. Tighten device_auth_codes RLS ────────────────────────────
DROP POLICY IF EXISTS "anon can read code by pk" ON device_auth_codes;

-- Revoke the implicit SELECT grant so the polling endpoint must use
-- the service role (which it does — tv-auth function uses service role).
REVOKE SELECT ON device_auth_codes FROM anon, authenticated;
GRANT  SELECT ON device_auth_codes TO service_role;

NOTIFY pgrst, 'reload schema';
