-- ═══════════════════════════════════════════════════════════════
-- PERFORMANCE REFINEMENT — Wave 6 (Database Query Optimization)
-- Additional indexes and query tuning for /for-you, /home, /profile routes
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Profile lookup optimization ────────────────────────────────
-- Speeds up profile fetches by ID (especially in AuthProvider)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'profiles' AND indexname = 'idx_profiles_id'
  ) THEN
    CREATE INDEX idx_profiles_id ON public.profiles(id DESC);
  END IF;
END $$;

-- ── 2. For-you feed optimization ──────────────────────────────────
-- CTE in get_for_you_feed does: watch_history JOIN → friends → mutual watches
-- These indexes speed the nested queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'follows' AND indexname = 'idx_follows_follower'
  ) THEN
    CREATE INDEX idx_follows_follower ON public.follows(follower_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'follows' AND indexname = 'idx_follows_following'
  ) THEN
    CREATE INDEX idx_follows_following ON public.follows(following_id);
  END IF;
END $$;

-- ── 3. Message count optimization ────────────────────────────────
-- Speed up friend_notification_count RPC
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'messages' AND indexname = 'idx_messages_receiver'
  ) THEN
    CREATE INDEX idx_messages_receiver_unread ON public.messages(receiver_id)
    WHERE read_at IS NULL;
  END IF;
END $$;

-- ── 4. Watch history pagination optimization ─────────────────────
-- Speeds up recent watch history queries with limit/offset
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'watch_history' AND indexname = 'idx_watch_history_recent'
  ) THEN
    CREATE INDEX idx_watch_history_recent ON public.watch_history(user_id, created_at DESC NULLS LAST);
  END IF;
END $$;

-- ── 5. List member lookups optimization ──────────────────────────
-- Speed up list sharing and member checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'list_members' AND indexname = 'idx_list_members_user'
  ) THEN
    CREATE INDEX idx_list_members_user ON public.list_members(user_id);
  END IF;
END $$;

-- ── 6. ANALYZE all modified tables ───────────────────────────────
-- Update query planner statistics
ANALYZE public.watch_history;
ANALYZE public.profiles;
ANALYZE public.follows;
ANALYZE public.messages;
ANALYZE public.list_members;

NOTIFY pgrst, 'reload schema';
