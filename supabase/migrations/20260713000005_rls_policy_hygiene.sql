-- ═══════════════════════════════════════════════════════════════
-- RLS policy hygiene: auth_rls_initplan + multiple_permissive_policies
-- ═══════════════════════════════════════════════════════════════
-- Two related Supabase advisor findings, fixed together since both touch
-- RLS policy definitions:
--
-- 1) auth_rls_initplan (61 policies / 27 tables): every policy below calls
--    auth.uid()/auth.role()/auth.jwt() directly in its USING/WITH CHECK
--    clause. Postgres re-evaluates a bare call to these (stable, not
--    immutable) functions once per row scanned. Wrapping the call as
--    `(select auth.uid())` lets the planner treat it as an InitPlan —
--    evaluated once per statement instead of once per row. This is
--    Supabase's own documented fix; it is behavior-preserving by
--    construction (same value, just cached), not a permissions change.
--    Applied via ALTER POLICY (in place) rather than DROP+CREATE so there
--    is no window where the table has fewer/no policies.
--
-- 2) multiple_permissive_policies (21 advisor rows, but only 2 tables):
--    - public.messages: "users read/send/update own messages" (role
--      `authenticated`) are fully redundant with msg_sel/msg_ins/msg_upd
--      (role `public`, which already covers `authenticated`) — same qual,
--      strictly narrower role. Dropped outright.
--    - public.list_members: "Members can view own memberships" (SELECT,
--      user_id = auth.uid()) is subsumed by lm_select (SELECT, same
--      condition OR list-owner). Dropped outright.
--      "Owners can manage members" (FOR ALL) overlapped lm_select/
--      lm_insert/lm_delete for SELECT/INSERT/DELETE, but was the *only*
--      policy granting UPDATE to list owners. Replaced with an
--      UPDATE-only policy (lm_update_by_owner) carrying the same
--      qual/check, so owners keep UPDATE access while the redundant
--      SELECT/INSERT/DELETE overlap goes away.
--
-- Validated locally (see CHANGELOG.md Session 3 entry) against a
-- throwaway Postgres 15.8.1.085 container: full 42-file replay clean,
-- and a set of owner/self/anon/authenticated access-scenario checks on
-- messages, list_members, carts and orders confirmed unchanged behavior
-- before/after this migration.
-- ═══════════════════════════════════════════════════════════════

-- === DROP (redundant / superseded policies) ===
DROP POLICY IF EXISTS "Members can view own memberships" ON public.list_members;
DROP POLICY IF EXISTS "Owners can manage members" ON public.list_members;
DROP POLICY IF EXISTS "users read own messages" ON public.messages;
DROP POLICY IF EXISTS "users send own messages" ON public.messages;
DROP POLICY IF EXISTS "users update own messages" ON public.messages;

-- === CREATE (narrower replacement for the dropped FOR-ALL owner policy) ===
CREATE POLICY "lm_update_by_owner" ON public.list_members
    FOR UPDATE
    USING ((EXISTS ( SELECT 1
   FROM custom_lists
  WHERE ((custom_lists.id = list_members.list_id) AND (custom_lists.owner_id = (select auth.uid()))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM custom_lists
  WHERE ((custom_lists.id = list_members.list_id) AND (custom_lists.owner_id = (select auth.uid()))))));

-- === ALTER (auth_rls_initplan rewrite: auth.<fn>() -> (select auth.<fn>())) ===
ALTER POLICY "cart_items_all" ON public.cart_items
    USING ((cart_id IN ( SELECT carts.id
   FROM carts
  WHERE (carts.user_id = (select auth.uid())))))
    WITH CHECK ((cart_id IN ( SELECT carts.id
   FROM carts
  WHERE (carts.user_id = (select auth.uid())))));

ALTER POLICY "carts_all" ON public.carts
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "cl_delete" ON public.custom_lists
    USING ((owner_id = (select auth.uid())));

ALTER POLICY "cl_insert" ON public.custom_lists
    WITH CHECK ((owner_id = (select auth.uid())));

ALTER POLICY "cl_select" ON public.custom_lists
    USING (((owner_id = (select auth.uid())) OR (is_public = true) OR is_list_member(id, (select auth.uid()))));

ALTER POLICY "cl_update" ON public.custom_lists
    USING ((owner_id = (select auth.uid())));

ALTER POLICY "debug_logs_insert" ON public.debug_logs
    WITH CHECK (((user_id IS NULL) OR ((select auth.uid()) = user_id)));

ALTER POLICY "debug_logs_select" ON public.debug_logs
    USING ((((select auth.uid()) = user_id) OR (((select auth.jwt()) ->> 'role'::text) = 'service_role'::text)));

ALTER POLICY "error_logs_insert" ON public.error_logs
    WITH CHECK (((user_id IS NULL) OR ((select auth.uid()) = user_id)));

ALTER POLICY "error_logs_select" ON public.error_logs
    USING ((((select auth.uid()) = user_id) OR (((select auth.jwt()) ->> 'role'::text) = 'service_role'::text)));

ALTER POLICY "follows: authenticated insert" ON public.follows
    WITH CHECK (((select auth.uid()) = follower_id));

ALTER POLICY "follows: owner delete" ON public.follows
    USING (((select auth.uid()) = follower_id));

ALTER POLICY "fr_insert" ON public.friend_requests
    WITH CHECK ((sender_id = (select auth.uid())));

ALTER POLICY "fr_select" ON public.friend_requests
    USING (((sender_id = (select auth.uid())) OR (receiver_id = (select auth.uid()))));

ALTER POLICY "li_delete" ON public.list_items
    USING ((list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.owner_id = (select auth.uid())))));

ALTER POLICY "li_insert" ON public.list_items
    WITH CHECK (((list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.owner_id = (select auth.uid())))) OR (EXISTS ( SELECT 1
   FROM list_members
  WHERE ((list_members.list_id = list_items.list_id) AND (list_members.user_id = (select auth.uid())) AND (list_members.role = 'editor'::text))))));

ALTER POLICY "li_select" ON public.list_items
    USING (((list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE ((custom_lists.owner_id = (select auth.uid())) OR (custom_lists.is_public = true)))) OR is_list_member(list_id, (select auth.uid()))));

ALTER POLICY "ll_del" ON public.list_likes
    USING (((select auth.uid()) = user_id));

ALTER POLICY "ll_ins" ON public.list_likes
    WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "lm_delete" ON public.list_members
    USING (((user_id = (select auth.uid())) OR (list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.owner_id = (select auth.uid()))))));

ALTER POLICY "lm_insert" ON public.list_members
    WITH CHECK ((list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.owner_id = (select auth.uid())))));

ALTER POLICY "lm_select" ON public.list_members
    USING (((user_id = (select auth.uid())) OR (list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.owner_id = (select auth.uid()))))));

ALTER POLICY "Authenticated users can rate public lists they dont own" ON public.list_ratings
    WITH CHECK ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM custom_lists
  WHERE ((custom_lists.id = list_ratings.list_id) AND (custom_lists.is_public = true) AND (custom_lists.owner_id <> (select auth.uid())))))));

ALTER POLICY "Users can delete own list rating" ON public.list_ratings
    USING (((select auth.uid()) = user_id));

ALTER POLICY "Users can update own list rating" ON public.list_ratings
    USING (((select auth.uid()) = user_id));

ALTER POLICY "listings_insert" ON public.listings
    WITH CHECK ((seller_id = (select auth.uid())));

ALTER POLICY "listings_select" ON public.listings
    USING (((status = 'active'::text) OR (seller_id = (select auth.uid()))));

ALTER POLICY "listings_update" ON public.listings
    USING ((seller_id = (select auth.uid())));

ALTER POLICY "msg_ins" ON public.messages
    WITH CHECK (((select auth.uid()) = sender_id));

ALTER POLICY "msg_sel" ON public.messages
    USING ((((select auth.uid()) = sender_id) OR ((select auth.uid()) = receiver_id)));

ALTER POLICY "msg_upd" ON public.messages
    USING (((select auth.uid()) = receiver_id));

ALTER POLICY "network_metrics_insert" ON public.network_metrics
    WITH CHECK (((user_id IS NULL) OR ((select auth.uid()) = user_id)));

ALTER POLICY "network_metrics_select" ON public.network_metrics
    USING ((((select auth.uid()) = user_id) OR (((select auth.jwt()) ->> 'role'::text) = 'service_role'::text)));

ALTER POLICY "notif_sel" ON public.notifications
    USING (((select auth.uid()) = user_id));

ALTER POLICY "notif_upd" ON public.notifications
    USING (((select auth.uid()) = user_id));

ALTER POLICY "order_items_select" ON public.order_items
    USING ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.buyer_id = (select auth.uid())))));

ALTER POLICY "orders_select" ON public.orders
    USING ((buyer_id = (select auth.uid())));

ALTER POLICY "owner delete" ON public.partners
    USING (((select auth.uid()) = user_id));

ALTER POLICY "owner insert" ON public.partners
    WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "owner select" ON public.partners
    USING (((select auth.uid()) = user_id));

ALTER POLICY "owner update" ON public.partners
    USING (((select auth.uid()) = user_id));

ALTER POLICY "performance_metrics_insert" ON public.performance_metrics
    WITH CHECK (((user_id IS NULL) OR ((select auth.uid()) = user_id)));

ALTER POLICY "performance_metrics_select" ON public.performance_metrics
    USING ((((select auth.uid()) = user_id) OR (((select auth.jwt()) ->> 'role'::text) = 'service_role'::text)));

ALTER POLICY "profiles: owner update" ON public.profiles
    USING (((select auth.uid()) = id));

ALTER POLICY "rec_insert" ON public.recommendations
    WITH CHECK ((from_id = (select auth.uid())));

ALTER POLICY "rec_select" ON public.recommendations
    USING (((to_id = (select auth.uid())) OR (from_id = (select auth.uid()))));

ALTER POLICY "rec_update" ON public.recommendations
    USING ((to_id = (select auth.uid())));

ALTER POLICY "addr_all" ON public.shipping_addresses
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "title_embeddings: authenticated insert" ON public.title_embeddings
    WITH CHECK (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "title_genres: authenticated insert" ON public.title_genres
    WITH CHECK (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "titles: authenticated insert" ON public.titles
    WITH CHECK (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "Users manage own trigger prefs" ON public.user_trigger_prefs
    USING (((select auth.uid()) = user_id))
    WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "watch_history: owner delete" ON public.watch_history
    USING (((select auth.uid()) = user_id));

ALTER POLICY "watch_history: owner insert" ON public.watch_history
    WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "watch_history: owner read" ON public.watch_history
    USING (((select auth.uid()) = user_id));

ALTER POLICY "watch_history: owner update" ON public.watch_history
    USING (((select auth.uid()) = user_id));
