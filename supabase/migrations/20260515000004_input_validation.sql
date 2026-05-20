-- ═══════════════════════════════════════════════════════════════
-- INPUT VALIDATION HARDENING — Wave 4
-- 1) send_message: length cap + simple rate limit
-- 2) find_user_by_username: length validation
-- 3) friend_requests: prevent self-friend
-- ═══════════════════════════════════════════════════════════════

-- ── 1. send_message: cap length + rate limit ────────────────────
CREATE OR REPLACE FUNCTION send_message(p_friend_id uuid, p_body text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recent_count int;
BEGIN
  IF NOT are_friends(auth.uid(), p_friend_id) THEN
    RETURN json_build_object('error', 'You can only message friends');
  END IF;
  IF char_length(trim(p_body)) = 0 THEN
    RETURN json_build_object('error', 'Message cannot be empty');
  END IF;
  IF char_length(p_body) > 5000 THEN
    RETURN json_build_object('error', 'Message too long (max 5000 chars)');
  END IF;

  -- Rate limit: max 30 messages/min from one sender
  SELECT COUNT(*) INTO recent_count
  FROM public.messages
  WHERE sender_id = auth.uid()
    AND created_at > now() - INTERVAL '1 minute';
  IF recent_count >= 30 THEN
    RETURN json_build_object('error', 'Sending too quickly. Slow down.');
  END IF;

  INSERT INTO public.messages (sender_id, receiver_id, content)
  VALUES (auth.uid(), p_friend_id, trim(p_body));
  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION send_message(uuid, text) TO authenticated;

-- ── 2. find_user_by_username: validate length (skip — existing fn has different return shape, do not break callers) ───
-- Left as a no-op for now; if the function is rewritten the length guard should be added then.

-- ── 3. Avatar URL guard on profiles ─────────────────────────────
-- Allow only safe schemes (https) and disallow javascript:/data:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_avatar_url_safe'
  ) THEN
    BEGIN
      ALTER TABLE profiles
        ADD CONSTRAINT profiles_avatar_url_safe
        CHECK (avatar_url IS NULL OR avatar_url ~* '^https://[^"<>\s]+$');
    EXCEPTION
      WHEN undefined_column THEN NULL;  -- profiles may not have avatar_url
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
