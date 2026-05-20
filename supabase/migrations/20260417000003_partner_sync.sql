-- ── Partner Sync ──────────────────────────────────────────────────
-- One row per user: stores their chosen partner.
CREATE TABLE IF NOT EXISTS partners (
  user_id    uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  partner_id uuid NOT NULL    REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select" ON partners FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner insert" ON partners FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner update" ON partners FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owner delete" ON partners FOR DELETE USING (auth.uid() = user_id);

-- ── RPC: resolve email → public profile info ──────────────────────
-- SECURITY DEFINER so it can read auth.users without exposing the table.
CREATE OR REPLACE FUNCTION find_user_by_email(p_email text)
RETURNS TABLE (id uuid, display_name text, avatar_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT  p.id,
          p.display_name,
          p.avatar_id
  FROM    auth.users u
  JOIN    profiles   p ON p.id = u.id
  WHERE   lower(u.email) = lower(trim(p_email))
    AND   u.id <> auth.uid()   -- cannot add yourself
  LIMIT 1;
END;
$$;

-- ── RPC: titles both users want to watch ──────────────────────────
-- SECURITY DEFINER so it can read both users' private watch_history.
CREATE OR REPLACE FUNCTION partner_sync_matches(p_partner_id uuid)
RETURNS TABLE (
  id           text,
  title        text,
  poster_path  text,
  media_type   text,
  release_date text,
  vote_average float
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT  t.id,
          t.title,
          t.poster_path,
          t.media_type,
          t.release_date,
          t.vote_average
  FROM    watch_history w1
  JOIN    watch_history w2
       ON w2.title_id        = w1.title_id
      AND w2.user_id         = p_partner_id
      AND w2.status          = 'want_to_watch'
      AND w2.episode_season  IS NULL
  JOIN    titles t ON t.id = w1.title_id
  WHERE   w1.user_id        = auth.uid()
    AND   w1.status         = 'want_to_watch'
    AND   w1.episode_season IS NULL
  ORDER BY t.popularity DESC NULLS LAST;
END;
$$;
