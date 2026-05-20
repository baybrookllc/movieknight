-- ═══════════════════════════════════════════════════════════════
-- FRIENDS SYSTEM
-- ═══════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────

CREATE TABLE friend_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','declined')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(sender_id, receiver_id),
  CHECK (sender_id <> receiver_id)
);

CREATE TABLE recommendations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id   text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  message    text,
  seen       boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────

CREATE INDEX idx_friend_requests_sender   ON friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status   ON friend_requests(status);
CREATE INDEX idx_recommendations_to       ON recommendations(to_id);
CREATE INDEX idx_recommendations_from     ON recommendations(from_id);

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_select" ON friend_requests FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "fr_insert" ON friend_requests FOR INSERT
  WITH CHECK (sender_id = auth.uid());

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec_select" ON recommendations FOR SELECT
  USING (to_id = auth.uid() OR from_id = auth.uid());
CREATE POLICY "rec_insert" ON recommendations FOR INSERT
  WITH CHECK (from_id = auth.uid());
CREATE POLICY "rec_update" ON recommendations FOR UPDATE
  USING (to_id = auth.uid());

-- ── Helper: are two users friends? ───────────────────────────────

CREATE OR REPLACE FUNCTION are_friends(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE status = 'accepted'
      AND ((sender_id = a AND receiver_id = b)
        OR (sender_id = b AND receiver_id = a))
  );
$$;

-- ── Send friend request by username ──────────────────────────────

CREATE OR REPLACE FUNCTION send_friend_request(p_username text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_receiver uuid;
  v_status   text;
BEGIN
  SELECT id INTO v_receiver FROM profiles WHERE lower(username) = lower(p_username);
  IF v_receiver IS NULL THEN
    RETURN json_build_object('error','User not found');
  END IF;
  IF v_receiver = auth.uid() THEN
    RETURN json_build_object('error','Cannot add yourself');
  END IF;
  SELECT status INTO v_status FROM friend_requests
    WHERE (sender_id = auth.uid() AND receiver_id = v_receiver)
       OR (sender_id = v_receiver AND receiver_id = auth.uid());
  IF v_status = 'accepted' THEN
    RETURN json_build_object('error','Already friends');
  END IF;
  IF v_status = 'pending' THEN
    RETURN json_build_object('error','Request already sent or pending');
  END IF;
  INSERT INTO friend_requests (sender_id, receiver_id)
  VALUES (auth.uid(), v_receiver)
  ON CONFLICT (sender_id, receiver_id)
    DO UPDATE SET status = 'pending', updated_at = now();
  RETURN json_build_object('ok', true);
END;
$$;

-- ── Accept / decline request ──────────────────────────────────────

CREATE OR REPLACE FUNCTION respond_friend_request(p_request_id uuid, p_accept boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE friend_requests
    SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
        updated_at = now()
  WHERE id = p_request_id AND receiver_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN
    RETURN json_build_object('error','Request not found');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;

-- ── Remove friend ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remove_friend(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM friend_requests WHERE status = 'accepted'
    AND ((sender_id = auth.uid() AND receiver_id = p_user_id)
      OR (sender_id = p_user_id AND receiver_id = auth.uid()));
$$;

-- ── Get friends list ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_friends()
RETURNS TABLE (
  user_id          uuid,
  display_name     text,
  username         text,
  avatar_id        text,
  last_title       text,
  last_poster      text,
  last_status      text,
  last_rating      int,
  last_watched_at  timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.display_name,
    p.username,
    p.avatar_id,
    t.title,
    t.poster_path,
    wh.status,
    wh.rating,
    wh.watched_at
  FROM friend_requests fr
  JOIN profiles p ON p.id =
    CASE WHEN fr.sender_id = auth.uid() THEN fr.receiver_id ELSE fr.sender_id END
  LEFT JOIN LATERAL (
    SELECT title_id, status, rating, watched_at
    FROM watch_history
    WHERE user_id = p.id AND episode_season IS NULL
      AND status <> 'not_interested'
    ORDER BY watched_at DESC LIMIT 1
  ) wh ON true
  LEFT JOIN titles t ON t.id = wh.title_id
  WHERE (fr.sender_id = auth.uid() OR fr.receiver_id = auth.uid())
    AND fr.status = 'accepted'
  ORDER BY wh.watched_at DESC NULLS LAST;
$$;

-- ── Get friend activity feed ──────────────────────────────────────

CREATE OR REPLACE FUNCTION get_friend_activity(p_limit int DEFAULT 30)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  username     text,
  avatar_id    text,
  title_id     text,
  title        text,
  poster_path  text,
  status       text,
  rating       int,
  watched_at   timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    p.id, p.display_name, p.username, p.avatar_id,
    wh.title_id, ti.title, ti.poster_path,
    wh.status, wh.rating, wh.watched_at
  FROM watch_history wh
  JOIN profiles p ON p.id = wh.user_id
  JOIN titles ti ON ti.id = wh.title_id
  WHERE wh.episode_season IS NULL
    AND wh.status <> 'not_interested'
    AND wh.user_id IN (
      SELECT CASE WHEN sender_id = auth.uid() THEN receiver_id ELSE sender_id END
      FROM friend_requests
      WHERE (sender_id = auth.uid() OR receiver_id = auth.uid())
        AND status = 'accepted'
    )
  ORDER BY wh.watched_at DESC
  LIMIT p_limit;
$$;

-- ── Get pending incoming requests ─────────────────────────────────

CREATE OR REPLACE FUNCTION get_pending_requests()
RETURNS TABLE (
  request_id   uuid,
  sender_id    uuid,
  display_name text,
  username     text,
  avatar_id    text,
  created_at   timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT fr.id, fr.sender_id, p.display_name, p.username, p.avatar_id, fr.created_at
  FROM friend_requests fr
  JOIN profiles p ON p.id = fr.sender_id
  WHERE fr.receiver_id = auth.uid() AND fr.status = 'pending'
  ORDER BY fr.created_at DESC;
$$;

-- ── Get sent pending requests ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_sent_requests()
RETURNS TABLE (
  request_id   uuid,
  receiver_id  uuid,
  display_name text,
  username     text,
  avatar_id    text,
  created_at   timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT fr.id, fr.receiver_id, p.display_name, p.username, p.avatar_id, fr.created_at
  FROM friend_requests fr
  JOIN profiles p ON p.id = fr.receiver_id
  WHERE fr.sender_id = auth.uid() AND fr.status = 'pending'
  ORDER BY fr.created_at DESC;
$$;

-- ── Get notification counts ───────────────────────────────────────

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
    )
  );
$$;

-- ── Send recommendation ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION send_recommendation(
  p_friend_id uuid,
  p_title_id  text,
  p_message   text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT are_friends(auth.uid(), p_friend_id) THEN
    RETURN json_build_object('error','Not friends with this user');
  END IF;
  INSERT INTO recommendations (from_id, to_id, title_id, message)
  VALUES (auth.uid(), p_friend_id, p_title_id, p_message);
  RETURN json_build_object('ok', true);
END;
$$;

-- ── Get recommendations inbox ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_recommendations()
RETURNS TABLE (
  id           uuid,
  from_id      uuid,
  display_name text,
  username     text,
  avatar_id    text,
  title_id     text,
  title        text,
  poster_path  text,
  message      text,
  seen         boolean,
  created_at   timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT r.id, r.from_id, p.display_name, p.username, p.avatar_id,
         r.title_id, t.title, t.poster_path, r.message, r.seen, r.created_at
  FROM recommendations r
  JOIN profiles p ON p.id = r.from_id
  JOIN titles t ON t.id = r.title_id
  WHERE r.to_id = auth.uid()
  ORDER BY r.created_at DESC;
$$;

-- ── Mark recommendations seen ─────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_recommendations_seen()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE recommendations SET seen = true
  WHERE to_id = auth.uid() AND seen = false;
$$;

-- ── Taste match ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_taste_match(p_friend_id uuid)
RETURNS TABLE (
  titles_in_common int,
  compatibility_pct int
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH mine AS (
    SELECT title_id, rating FROM watch_history
    WHERE user_id = auth.uid() AND status = 'watched'
      AND episode_season IS NULL AND rating IS NOT NULL
  ),
  theirs AS (
    SELECT title_id, rating FROM watch_history
    WHERE user_id = p_friend_id AND status = 'watched'
      AND episode_season IS NULL AND rating IS NOT NULL
  ),
  common AS (
    SELECT m.rating AS my_r, t.rating AS their_r
    FROM mine m JOIN theirs t ON t.title_id = m.title_id
  )
  SELECT
    COUNT(*)::int,
    GREATEST(0, LEAST(100,
      CASE WHEN COUNT(*) = 0 THEN 0
           ELSE (100 - AVG(ABS(my_r - their_r)) * 10)::int
      END
    ))
  FROM common;
$$;

-- ── Friend's public profile data ──────────────────────────────────

CREATE OR REPLACE FUNCTION get_friend_profile(p_friend_id uuid)
RETURNS TABLE (
  title_id    text,
  title       text,
  poster_path text,
  status      text,
  rating      int,
  watched_at  timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT wh.title_id, t.title, t.poster_path, wh.status, wh.rating, wh.watched_at
  FROM watch_history wh
  JOIN titles t ON t.id = wh.title_id
  WHERE wh.user_id = p_friend_id
    AND wh.episode_season IS NULL
    AND wh.status <> 'not_interested'
    AND are_friends(auth.uid(), p_friend_id)
  ORDER BY wh.watched_at DESC
  LIMIT 12;
$$;
