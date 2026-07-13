-- ═══════════════════════════════════════════════════════════════
-- Performance advisory remediation — safe/additive subset (2026-07-13)
--
-- From get_advisors(performance). This migration takes ONLY the
-- unambiguously-safe, behaviour-neutral items:
--
--   • unindexed_foreign_keys (×8) → add a covering index on each FK column.
--     Purely additive; improves FK joins and ON DELETE CASCADE performance.
--
--   • duplicate_index (×2) → drop the redundant UNIQUE constraint that is
--     identical to the primary key. Verified against live schema:
--       - list_ratings: PK(list_id,user_id) + UNIQUE(list_id,user_id)
--       - title_genres: PK(title_id,genre_id) + UNIQUE(title_id,genre_id)
--     No foreign key references either UNIQUE constraint (verified), so the
--     PK continues to enforce uniqueness after the drop.
--
-- Deliberately NOT included — would risk degrading behaviour for ~0 benefit
-- on the current near-empty tables (documented in the audit report):
--   • unused_index (×41): pg_stat "unused" is unreliable on a young / low-
--     traffic database, and several are deliberate feature indexes. Not dropped.
--   • auth_rls_initplan (×53) + multiple_permissive_policies (×21): behaviour-
--     preserving RLS-policy rewrites, deferred to a dedicated reviewed pass.
--
-- Idempotent / re-runnable.
-- ═══════════════════════════════════════════════════════════════

-- ── Covering indexes for unindexed foreign keys ──────────────────
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id          ON public.error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_list_items_added_by         ON public.list_items(added_by);
CREATE INDEX IF NOT EXISTS idx_list_items_title_id         ON public.list_items(title_id);
CREATE INDEX IF NOT EXISTS idx_list_ratings_user_id        ON public.list_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_network_metrics_user_id     ON public.network_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_partners_partner_id         ON public.partners(partner_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_id ON public.performance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_title_id    ON public.recommendations(title_id);

-- ── Drop redundant duplicate indexes (identical to the primary key) ──
ALTER TABLE public.list_ratings DROP CONSTRAINT IF EXISTS list_ratings_list_id_user_id_key;
ALTER TABLE public.title_genres DROP CONSTRAINT IF EXISTS title_genres_title_id_genre_id_key;
