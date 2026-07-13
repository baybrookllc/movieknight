-- ═══════════════════════════════════════════════════════════════
-- Drop duplicate indexes surfaced by Session 3's advisor re-run
-- ═══════════════════════════════════════════════════════════════
-- 3 tables each have a byte-for-byte identical index pair. Root cause:
-- 20260515000005_performance_refinement.sql's guarded CREATE INDEX
-- statements for these 3 indexes never actually ran (its whole transaction
-- silently rolled back due to the watch_history.created_at typo fixed in
-- Session 2 — see 20260713000004_apply_missed_wave6_indexes.sql). That
-- Session 2 fix re-created them under the same names it expected, without
-- checking whether equivalent indexes already existed under different
-- names from before migration tracking began (follows, list_members) or
-- from an earlier, successfully-applied migration (messages).
--
--   Table         | Keep (pre-existing)        | Drop (Session 2 duplicate)
--   --------------|-----------------------------|----------------------------
--   follows       | idx_follows_following_id    | idx_follows_following
--   list_members  | idx_list_members_user_id    | idx_list_members_user
--   messages      | idx_messages_unread         | idx_messages_receiver_unread
--
-- Confirmed via pg_indexes that each pair has identical columns/predicate;
-- dropping one of each pair is pure index-storage cleanup, no behavior
-- change (the query planner was already free to pick either).
-- ═══════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.idx_follows_following;
DROP INDEX IF EXISTS public.idx_list_members_user;
DROP INDEX IF EXISTS public.idx_messages_receiver_unread;
