-- Trigger warning system: user prefs + DTDD cache
-- ──────────────────────────────────────────────────

-- ── 1. tw_enabled flag on profiles ───────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tw_enabled boolean NOT NULL DEFAULT false;

-- ── 2. user_trigger_prefs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_trigger_prefs (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_key  text NOT NULL,   -- DTDD topicKey e.g. 'dog', 'suicide'
  action     text NOT NULL CHECK (action IN ('flag', 'hide')),
  PRIMARY KEY (user_id, topic_key)
);

ALTER TABLE public.user_trigger_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own trigger prefs"
  ON public.user_trigger_prefs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. dtdd_cache ─────────────────────────────────────────────────
-- Stores only triggered topics (yesSum/voteSum >= 0.70) per title.
-- Empty array = title known to DTDD but no active warnings.
-- Missing row = title not yet looked up (or not in DTDD database).
CREATE TABLE IF NOT EXISTS public.dtdd_cache (
  title_id   text        NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  topics     jsonb       NOT NULL DEFAULT '[]',  -- [{topicKey, topicName, yesSum, noSum, voteSum}]
  cached_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id)
);

ALTER TABLE public.dtdd_cache ENABLE ROW LEVEL SECURITY;

-- Public read so the anon key can read cache hits; service role writes
CREATE POLICY "Public read dtdd cache"
  ON public.dtdd_cache FOR SELECT USING (true);
