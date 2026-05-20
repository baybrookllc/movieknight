-- ═══════════════════════════════════════════════════════════════
-- DIRECT MESSAGES — RPCs (final)
-- Drops prior versions with incompatible signatures, then recreates.
-- Table schema: messages(id, sender_id, receiver_id, content, created_at, read_at)
-- ═══════════════════════════════════════════════════════════════

-- Indexes (IF NOT EXISTS — idempotent)
CREATE INDEX IF NOT EXISTS idx_messages_pair ON public.messages
  (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(receiver_id)
  WHERE read_at IS NULL;

-- Drop existing functions that have incompatible return signatures
DROP FUNCTION IF EXISTS public.get_conversations();
DROP FUNCTION IF EXISTS public.get_messages(uuid, integer);
DROP FUNCTION IF EXISTS public.send_message(uuid, text);

-- ── get_conversations ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_conversations()
RETURNS TABLE (
  other_id     uuid,
  display_name text,
  username     text,
  avatar_id    text,
  last_message text,
  last_sent_at timestamptz,
  is_sender    boolean,
  unseen_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH last_msg AS (
    SELECT DISTINCT ON (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
      sender_id, receiver_id, content, created_at,
      (sender_id = auth.uid()) AS is_sender
    FROM public.messages
    WHERE sender_id = auth.uid() OR receiver_id = auth.uid()
    ORDER BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC
  ),
  unseen AS (
    SELECT sender_id AS other_id, COUNT(*)::bigint AS cnt
    FROM public.messages
    WHERE receiver_id = auth.uid() AND read_at IS NULL
    GROUP BY sender_id
  )
  SELECT
    CASE WHEN lm.sender_id = auth.uid() THEN lm.receiver_id ELSE lm.sender_id END,
    p.display_name,
    p.username,
    p.avatar_id,
    lm.content,
    lm.created_at,
    lm.is_sender,
    COALESCE(u.cnt, 0::bigint)
  FROM last_msg lm
  JOIN profiles p ON p.id = CASE WHEN lm.sender_id = auth.uid() THEN lm.receiver_id ELSE lm.sender_id END
  LEFT JOIN unseen u ON u.other_id = CASE WHEN lm.sender_id = auth.uid() THEN lm.receiver_id ELSE lm.sender_id END
  ORDER BY lm.created_at DESC;
$$;

-- ── get_messages ──────────────────────────────────────────────────
-- Aliases DB columns to names messages.js expects.

CREATE OR REPLACE FUNCTION get_messages(p_friend_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  id         uuid,
  from_id    uuid,
  body       text,
  seen       boolean,
  created_at timestamptz,
  is_mine    boolean
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT m.id,
         m.sender_id,
         m.content,
         (m.read_at IS NOT NULL),
         m.created_at,
         (m.sender_id = auth.uid())
  FROM public.messages m
  WHERE (m.sender_id = auth.uid() AND m.receiver_id = p_friend_id)
     OR (m.sender_id = p_friend_id AND m.receiver_id = auth.uid())
  ORDER BY m.created_at ASC
  LIMIT p_limit;
$$;

-- ── send_message ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION send_message(p_friend_id uuid, p_body text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT are_friends(auth.uid(), p_friend_id) THEN
    RETURN json_build_object('error', 'You can only message friends');
  END IF;
  IF char_length(trim(p_body)) = 0 THEN
    RETURN json_build_object('error', 'Message cannot be empty');
  END IF;
  INSERT INTO public.messages (sender_id, receiver_id, content)
  VALUES (auth.uid(), p_friend_id, trim(p_body));
  RETURN json_build_object('ok', true);
END;
$$;

-- ── mark_messages_seen ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_messages_seen(p_friend_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.messages SET read_at = now()
  WHERE sender_id = p_friend_id AND receiver_id = auth.uid() AND read_at IS NULL;
$$;

-- ── get_friend_notification_count (add unseen_messages) ───────────

CREATE OR REPLACE FUNCTION get_friend_notification_count()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object(
    'pending_requests', (
      SELECT COUNT(*) FROM friend_requests
      WHERE receiver_id = auth.uid() AND status = 'pending'
    ),
    'unseen_recs', (
      SELECT COUNT(*) FROM recommendations
      WHERE to_id = auth.uid() AND seen = false
    ),
    'unseen_messages', (
      SELECT COUNT(DISTINCT sender_id) FROM public.messages
      WHERE receiver_id = auth.uid() AND read_at IS NULL
    )
  );
$$;

-- ── Grants ────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION get_conversations()             TO authenticated;
GRANT EXECUTE ON FUNCTION get_messages(uuid, int)         TO authenticated;
GRANT EXECUTE ON FUNCTION send_message(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION mark_messages_seen(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_friend_notification_count() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
