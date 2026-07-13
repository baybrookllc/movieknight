-- ═══════════════════════════════════════════════════════════════
-- Apply indexes two already-"applied" migrations never actually created
-- ═══════════════════════════════════════════════════════════════
-- Discovered while validating a from-zero migration replay (see
-- 20260401000000_baseline_schema.sql): both migrations below are recorded
-- as applied in this project's migration history, but neither actually
-- created its indexes on the live database — confirmed by querying
-- pg_indexes directly. The most likely explanation: each ran as a single
-- transaction that hit an error partway through and rolled back
-- everything, yet the history table still recorded it as applied.
--
-- 1) 20260515000005_performance_refinement.sql referenced
--    watch_history.created_at, a column that has never existed on that
--    table (it's watched_at) — fixed in the source file, but fixing the
--    file doesn't retroactively re-run it here, since it's already marked
--    applied. None of its 6 guarded indexes exist live.
-- 2) 20260518000001_friend_requests_composite_indexes.sql's DROP + 2x
--    CREATE INDEX never took effect either — the old single-column
--    idx_friend_requests_status is still live, the 2 composite indexes
--    aren't.
--
-- All statements below are guarded (IF NOT EXISTS / IF EXISTS) and purely
-- additive/performance — no behavior change, safe to run regardless of
-- current state.
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON public.messages(receiver_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_watch_history_recent ON public.watch_history(user_id, watched_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_list_members_user ON public.list_members(user_id);

DROP INDEX IF EXISTS idx_friend_requests_status;
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status ON public.friend_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status ON public.friend_requests(receiver_id, status);

ANALYZE public.profiles;
ANALYZE public.follows;
ANALYZE public.messages;
ANALYZE public.watch_history;
ANALYZE public.list_members;
ANALYZE public.friend_requests;

NOTIFY pgrst, 'reload schema';
