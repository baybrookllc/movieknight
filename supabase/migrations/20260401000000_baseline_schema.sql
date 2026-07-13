-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE SCHEMA — pre-migration-tracking objects
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration tracking in this repo starts at 20260416000000, which assumes
-- `titles` (and 11 other core tables) already exist. They were created
-- directly in the Supabase dashboard/SQL editor before this project adopted
-- the Supabase CLI migration workflow, so a from-zero replay of
-- supabase/migrations/*.sql has never been able to rebuild the database —
-- a real disaster-recovery gap. This migration closes it.
--
-- Contents were reconstructed 2026-07-13 from the live project's actual
-- schema (pg_dump + pg_catalog introspection), scoped to exactly the objects
-- no tracked migration creates: 12 tables, the `vector` extension, 15
-- functions, and 3 triggers. Every later migration that touches these
-- objects was individually checked for idempotency (IF NOT EXISTS / DO-block
-- guards) before being confirmed safe to layer on top of this baseline — see
-- the one deliberate exception noted at `watch_history` below.
--
-- On the live project these objects already exist; this file is applied
-- there via `supabase migration repair --status applied` (history bookkeeping
-- only, no schema change). It only executes for real when replaying from a
-- blank database — local dev, CI, or disaster recovery.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- ── genres ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genres (
    id integer NOT NULL,
    name text NOT NULL
);

ALTER TABLE ONLY public.genres
    ADD CONSTRAINT genres_pkey PRIMARY KEY (id);

ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "genres: public read" ON public.genres FOR SELECT USING (true);

GRANT ALL ON TABLE public.genres TO anon, authenticated, service_role;

COMMENT ON TABLE public.genres IS 'Static genre lookup. IDs match TMDB genre IDs directly to simplify API mapping.';

-- ── titles ────────────────────────────────────────────────────────────────
-- All columns below are the current live shape (including columns added by
-- later tracked migrations via ADD COLUMN IF NOT EXISTS — safe to include
-- here since those statements are idempotent no-ops on replay).
CREATE TABLE IF NOT EXISTS public.titles (
    id text NOT NULL,
    tmdb_id integer NOT NULL,
    media_type text NOT NULL,
    title text NOT NULL,
    overview text,
    poster_path text,
    backdrop_path text,
    release_date date,
    vote_average numeric(3,1),
    popularity numeric(10,3),
    cached_at timestamp with time zone DEFAULT now() NOT NULL,
    runtime integer,
    original_language text,
    origin_country text,
    certification_ca text,
    budget bigint,
    revenue bigint,
    studios text[],
    directors text[],
    writers text[],
    spoken_languages text[],
    awards_json jsonb,
    watch_providers_json jsonb,
    theatrical_ca text,
    theatrical_us text,
    trailers_json jsonb,
    CONSTRAINT titles_media_type_check CHECK ((media_type = ANY (ARRAY['movie'::text, 'tv'::text])))
);

ALTER TABLE ONLY public.titles
    ADD CONSTRAINT titles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.titles
    ADD CONSTRAINT titles_tmdb_id_media_type_key UNIQUE (tmdb_id, media_type);

CREATE INDEX IF NOT EXISTS idx_titles_release_date ON public.titles USING btree (release_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_titles_tmdb_id ON public.titles USING btree (tmdb_id);
CREATE INDEX IF NOT EXISTS idx_titles_vote_average ON public.titles USING btree (vote_average DESC NULLS LAST);

ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "titles: public read" ON public.titles FOR SELECT USING (true);
CREATE POLICY "titles: authenticated insert" ON public.titles FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

GRANT ALL ON TABLE public.titles TO anon, authenticated, service_role;

COMMENT ON TABLE public.titles IS 'Local TMDB metadata cache. The id column is a composite key in the format "media_type:tmdb_id" (e.g. "movie:550", "tv:1396") to guarantee global uniqueness across movies and TV shows without collision.';
COMMENT ON COLUMN public.titles.poster_path IS 'Relative path from TMDB. Prepend https://image.tmdb.org/t/p/w500 in the app.';
COMMENT ON COLUMN public.titles.cached_at IS 'Timestamp of last cache. Re-fetch from TMDB if older than 7 days.';

-- Database webhook: fires generate-embedding on every new title insert.
-- The live trigger's Authorization header carries a bearer token that is
-- NOT the app's public anon key (verified against NEXT_PUBLIC_SUPABASE_ANON_KEY
-- — different value/length) — redacted here rather than committed to git.
-- If replaying this baseline to recreate the webhook for real, replace
-- <WEBHOOK_AUTH_TOKEN> with the current project's correct token. If this
-- trigger isn't restored, embeddings can be backfilled via
-- supabase/migrations/20260509_backfill_embeddings.sql or the mcp-server
-- `backfill_embeddings` tool.
-- Guarded: supabase_functions is only present under the full Supabase stack
-- (a real project, or `supabase start`) — not a bare Postgres instance, so
-- this skips gracefully there instead of failing the replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'supabase_functions') THEN
    EXECUTE $trigger$
      CREATE TRIGGER "auto-embed-new-titles" AFTER INSERT ON public.titles
          FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
              'https://nwvliipxqedueskhxdym.supabase.co/functions/v1/generate-embedding',
              'POST',
              '{"Content-type":"application/json","Authorization":"Bearer <WEBHOOK_AUTH_TOKEN>"}',
              '{}',
              '5000'
          )
    $trigger$;
  END IF;
END $$;

-- ── profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    display_name text,
    avatar_url text,
    bio text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_id text,
    tw_enabled boolean DEFAULT false NOT NULL,
    notify_weekly boolean DEFAULT false NOT NULL,
    notification_email text,
    last_seen timestamp with time zone,
    CONSTRAINT profiles_avatar_url_safe CHECK (((avatar_url IS NULL) OR (avatar_url ~* '^https://[^"<>\s]+$'::text)))
);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS profiles_notify_weekly_idx ON public.profiles USING btree (notify_weekly) WHERE (notify_weekly = true);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles: owner update" ON public.profiles FOR UPDATE USING ((auth.uid() = id));

GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;

COMMENT ON TABLE public.profiles IS 'One-to-one extension of auth.users. Auto-created by trigger on signup.';

-- ── title_genres ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.title_genres (
    title_id text NOT NULL,
    genre_id integer NOT NULL
);

ALTER TABLE ONLY public.title_genres
    ADD CONSTRAINT title_genres_pkey PRIMARY KEY (title_id, genre_id);

ALTER TABLE ONLY public.title_genres
    ADD CONSTRAINT title_genres_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES public.genres(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.title_genres
    ADD CONSTRAINT title_genres_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.titles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_title_genres_genre_id ON public.title_genres USING btree (genre_id);

ALTER TABLE public.title_genres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "title_genres: public read" ON public.title_genres FOR SELECT USING (true);
CREATE POLICY "title_genres: authenticated insert" ON public.title_genres FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

GRANT ALL ON TABLE public.title_genres TO anon, authenticated, service_role;

-- NOTE: title_genres_title_id_genre_id_key (a redundant UNIQUE identical to
-- the PK) predated tracking too, but was already dropped live on 2026-07-13
-- (supabase/migrations/20260713000002_perf_fk_indexes.sql). Not recreated
-- here — this baseline reflects current live state, which no longer has it.

-- ── title_embeddings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.title_embeddings (
    title_id text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    embedded_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.title_embeddings
    ADD CONSTRAINT title_embeddings_pkey PRIMARY KEY (title_id);

ALTER TABLE ONLY public.title_embeddings
    ADD CONSTRAINT title_embeddings_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.titles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS title_embeddings_embedding_idx ON public.title_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='128');

ALTER TABLE public.title_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "title_embeddings: public read" ON public.title_embeddings FOR SELECT USING (true);
CREATE POLICY "title_embeddings: authenticated insert" ON public.title_embeddings FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

GRANT ALL ON TABLE public.title_embeddings TO anon, authenticated, service_role;

COMMENT ON TABLE public.title_embeddings IS 'OpenAI vector embeddings for semantic search via pgvector. Embedding source: concatenation of title + overview + genre names. Model: text-embedding-3-small (1536 dimensions). Use the match_titles function below to query.';

-- ── follows ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT no_self_follow CHECK ((follower_id <> following_id))
);

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows USING btree (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows USING btree (following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows: public read" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follows: authenticated insert" ON public.follows FOR INSERT WITH CHECK ((auth.uid() = follower_id));
CREATE POLICY "follows: owner delete" ON public.follows FOR DELETE USING ((auth.uid() = follower_id));

GRANT ALL ON TABLE public.follows TO anon, authenticated, service_role;

COMMENT ON TABLE public.follows IS 'Directional social graph. A row means follower_id follows following_id.';

-- handle_updated_at is defined here (ahead of the functions block further
-- down) because the custom_lists trigger below references it.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.handle_updated_at() TO anon, authenticated, service_role;

-- custom_lists, list_items, and list_members are circularly related by RLS
-- policy (is_list_member() reads list_members; list_members' own owner-check
-- reads custom_lists; list_items reads both). All three tables are created
-- first, then is_list_member(), then every policy for all three — instead of
-- interleaving table-then-policy per table as elsewhere in this file.

-- ── custom_lists ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_lists (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    is_public boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.custom_lists
    ADD CONSTRAINT custom_lists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.custom_lists
    ADD CONSTRAINT custom_lists_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_custom_lists_owner_id ON public.custom_lists USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_custom_lists_public ON public.custom_lists USING btree (is_public) WHERE (is_public = true);

ALTER TABLE public.custom_lists ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.custom_lists TO anon, authenticated, service_role;

CREATE TRIGGER on_list_updated BEFORE UPDATE ON public.custom_lists
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── list_items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.list_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    list_id uuid NOT NULL,
    title_id text NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_list_id_title_id_key UNIQUE (list_id, title_id);

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.custom_lists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.titles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_list_items_list_added_at ON public.list_items USING btree (list_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON public.list_items USING btree (list_id);

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.list_items TO anon, authenticated, service_role;

-- ── list_members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.list_members (
    list_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT list_members_role_check CHECK ((role = ANY (ARRAY['editor'::text, 'viewer'::text])))
);

ALTER TABLE ONLY public.list_members
    ADD CONSTRAINT list_members_pkey PRIMARY KEY (list_id, user_id);

ALTER TABLE ONLY public.list_members
    ADD CONSTRAINT list_members_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.custom_lists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.list_members
    ADD CONSTRAINT list_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_list_members_user_id ON public.list_members USING btree (user_id);

ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.list_members TO anon, authenticated, service_role;

COMMENT ON TABLE public.list_members IS 'Collaborators on a list. Does not include the owner (see custom_lists.owner_id). role=editor can add/remove items. role=viewer can only read.';

-- is_list_member is defined here (ahead of the functions block further down)
-- because the policies immediately below reference it, and it in turn reads
-- list_members — which now exists.
CREATE OR REPLACE FUNCTION public.is_list_member(p_list_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.list_members
    WHERE list_id = p_list_id AND user_id = p_user_id
  );
$function$;

GRANT ALL ON FUNCTION public.is_list_member(uuid, uuid) TO anon, authenticated, service_role;

CREATE POLICY cl_select ON public.custom_lists FOR SELECT USING (((owner_id = auth.uid()) OR (is_public = true) OR is_list_member(id, auth.uid())));
CREATE POLICY cl_insert ON public.custom_lists FOR INSERT WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY cl_update ON public.custom_lists FOR UPDATE USING ((owner_id = auth.uid()));
CREATE POLICY cl_delete ON public.custom_lists FOR DELETE USING ((owner_id = auth.uid()));

CREATE POLICY li_select ON public.list_items FOR SELECT USING (((list_id IN ( SELECT custom_lists.id FROM custom_lists WHERE ((custom_lists.owner_id = auth.uid()) OR (custom_lists.is_public = true)))) OR is_list_member(list_id, auth.uid())));
CREATE POLICY li_insert ON public.list_items FOR INSERT WITH CHECK (((list_id IN ( SELECT custom_lists.id FROM custom_lists WHERE (custom_lists.owner_id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM list_members WHERE ((list_members.list_id = list_items.list_id) AND (list_members.user_id = auth.uid()) AND (list_members.role = 'editor'::text))))));
CREATE POLICY li_delete ON public.list_items FOR DELETE USING ((list_id IN ( SELECT custom_lists.id FROM custom_lists WHERE (custom_lists.owner_id = auth.uid()))));

CREATE POLICY lm_select ON public.list_members FOR SELECT USING (((user_id = auth.uid()) OR (list_id IN ( SELECT custom_lists.id FROM custom_lists WHERE (custom_lists.owner_id = auth.uid())))));
CREATE POLICY lm_insert ON public.list_members FOR INSERT WITH CHECK ((list_id IN ( SELECT custom_lists.id FROM custom_lists WHERE (custom_lists.owner_id = auth.uid()))));
CREATE POLICY lm_delete ON public.list_members FOR DELETE USING (((user_id = auth.uid()) OR (list_id IN ( SELECT custom_lists.id FROM custom_lists WHERE (custom_lists.owner_id = auth.uid())))));

-- NOTE: "Owners can manage members" and "Members can view own memberships"
-- are NOT created here even though they exist live — 20260418000002 creates
-- both, guarded by an `IF NOT EXISTS (SELECT ... FROM pg_policies ...)` DO
-- block, so it correctly (re)creates them on a from-zero replay.

-- ── list_likes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.list_likes (
    list_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.list_likes
    ADD CONSTRAINT list_likes_pkey PRIMARY KEY (list_id, user_id);

ALTER TABLE public.list_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY ll_sel ON public.list_likes FOR SELECT USING (true);
CREATE POLICY ll_ins ON public.list_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY ll_del ON public.list_likes FOR DELETE USING ((auth.uid() = user_id));

GRANT ALL ON TABLE public.list_likes TO anon, authenticated, service_role;

-- ── notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    actor_id uuid,
    title_id text,
    list_id uuid,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_sel ON public.notifications FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY notif_upd ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));

GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;

-- ── messages ──────────────────────────────────────────────────────────────
-- Also predates tracking, even though 20260515000002_security_hardening.sql
-- has a `CREATE TABLE IF NOT EXISTS public.messages` — that's a defensive
-- no-op (its own comments say "if table already existed"). The real tell:
-- 20260510000001_messages_rpcs.sql (an EARLIER-timestamped migration)
-- already references public.messages, so it must exist before that runs.
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT messages_content_check CHECK (((char_length(content) > 0) AND (char_length(content) <= 5000)))
);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY msg_sel ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));
CREATE POLICY msg_ins ON public.messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));
CREATE POLICY msg_upd ON public.messages FOR UPDATE USING ((auth.uid() = receiver_id));

GRANT ALL ON TABLE public.messages TO anon, authenticated, service_role;

-- NOTE: "users {read,send,update} own messages" are NOT created here even
-- though they exist live — 20260515000002 DROPs then unconditionally
-- recreates all three (DROP POLICY IF EXISTS ... ; CREATE POLICY ...), which
-- is safe whether or not they already exist. They're also fully redundant
-- with msg_sel/msg_ins/msg_upd above (same logic, broader role scope) and
-- slated for removal in the RLS-hygiene session regardless.

-- ── watch_history ─────────────────────────────────────────────────────────
-- watch_history_status_check is deliberately NOT included here: a DO block
-- in 20260417000002_not_interested_status.sql finds and drops whatever the
-- live status CHECK constraint is named, then unconditionally (no IF NOT
-- EXISTS) re-adds it as watch_history_status_check. Including it here would
-- make that later ADD CONSTRAINT fail on replay ("constraint already
-- exists"). Omitting it lets that migration create it fresh, as intended.
CREATE TABLE IF NOT EXISTS public.watch_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title_id text NOT NULL,
    episode_season integer,
    episode_number integer,
    status text DEFAULT 'watched'::text NOT NULL,
    rating integer,
    review text,
    watched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT episode_fields_complete CHECK ((((episode_season IS NULL) AND (episode_number IS NULL)) OR ((episode_season IS NOT NULL) AND (episode_number IS NOT NULL)))),
    CONSTRAINT watch_history_rating_check CHECK (((rating >= 1) AND (rating <= 10)))
);

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.titles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_watch_history_season ON public.watch_history USING btree (title_id, episode_season);
CREATE INDEX IF NOT EXISTS idx_watch_history_title_id ON public.watch_history USING btree (title_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_title ON public.watch_history USING btree (user_id, title_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_watched ON public.watch_history USING btree (user_id, watched_at DESC);

ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watch_history: owner read" ON public.watch_history FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "watch_history: owner insert" ON public.watch_history FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "watch_history: owner update" ON public.watch_history FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "watch_history: owner delete" ON public.watch_history FOR DELETE USING ((auth.uid() = user_id));

GRANT ALL ON TABLE public.watch_history TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-tracking functions (none created by any tracked migration)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    -- Default username: email prefix before the @
    SPLIT_PART(NEW.email, '@', 1),
    -- Default display name: same as username initially
    SPLIT_PART(NEW.email, '@', 1),
    -- Default avatar: use DiceBear API for a unique auto-generated avatar
    'https://api.dicebear.com/7.x/initials/svg?seed=' || SPLIT_PART(NEW.email, '@', 1)
  );
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_actor_id uuid DEFAULT NULL::uuid, p_title_id text DEFAULT NULL::text, p_list_id uuid DEFAULT NULL::uuid, p_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id,type,actor_id,title_id,list_id,message)
  VALUES (p_user_id,p_type,p_actor_id,p_title_id,p_list_id,p_message);
END; $function$;

GRANT ALL ON FUNCTION public.create_notification(uuid, text, uuid, text, uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_notifications(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, type text, actor_id uuid, actor_name text, actor_avatar text, title_id text, title text, poster_path text, list_id uuid, list_title text, message text, created_at timestamp with time zone, read_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT n.id,n.type,n.actor_id,p.display_name,p.avatar_url,
         n.title_id,t.title,t.poster_path,n.list_id,cl.title,
         n.message,n.created_at,n.read_at
  FROM public.notifications n
  LEFT JOIN public.profiles p ON p.id=n.actor_id
  LEFT JOIN public.titles t ON t.id=n.title_id
  LEFT JOIN public.custom_lists cl ON cl.id=n.list_id
  WHERE n.user_id=auth.uid()
  ORDER BY n.created_at DESC LIMIT p_limit;
END; $function$;

GRANT ALL ON FUNCTION public.get_notifications(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v bigint;
BEGIN SELECT COUNT(*) INTO v FROM public.notifications WHERE user_id=auth.uid() AND read_at IS NULL; RETURN v; END; $function$;

GRANT ALL ON FUNCTION public.get_unread_notification_count() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_notifications_read()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN UPDATE public.notifications SET read_at=now() WHERE user_id=auth.uid() AND read_at IS NULL; END; $function$;

GRANT ALL ON FUNCTION public.mark_notifications_read() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_unread_message_count()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v bigint;
BEGIN SELECT COUNT(*) INTO v FROM public.messages WHERE receiver_id=auth.uid() AND read_at IS NULL; RETURN v; END; $function$;

GRANT ALL ON FUNCTION public.get_unread_message_count() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_messages_read(p_partner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.messages SET read_at=now()
  WHERE receiver_id=auth.uid() AND sender_id=p_partner_id AND read_at IS NULL;
END; $function$;

GRANT ALL ON FUNCTION public.mark_messages_read(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_last_seen()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN UPDATE public.profiles SET last_seen=now() WHERE id=auth.uid(); END; $function$;

GRANT ALL ON FUNCTION public.update_last_seen() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_taste_data(p_user_id uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(genre_id integer, watch_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tg.genre_id, COUNT(*) AS watch_count
  FROM   watch_history wh
  JOIN   title_genres  tg ON tg.title_id = wh.title_id
  WHERE  wh.user_id          = p_user_id
    AND  wh.status           != 'not_interested'
    AND  wh.episode_season   IS NULL
    AND  wh.title_id         LIKE 'movie:%'
  GROUP  BY tg.genre_id
  ORDER  BY watch_count DESC
  LIMIT  50
$function$;

GRANT ALL ON FUNCTION public.get_user_taste_data(uuid, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_why_text(p_title_id text)
 RETURNS TABLE(liked_similar_title text, liked_similar_title_id text, friend_count bigint, is_trending_in_circle boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH
  target_genres AS (SELECT genre_id FROM public.title_genres WHERE title_id=p_title_id),
  similar_liked AS (
    SELECT t.id,t.title FROM public.watch_history wh JOIN public.titles t ON t.id=wh.title_id
    WHERE wh.user_id=auth.uid() AND wh.episode_number IS NULL
      AND wh.rating>=8 AND wh.title_id<>p_title_id
      AND EXISTS(SELECT 1 FROM public.title_genres tg
                 WHERE tg.title_id=wh.title_id
                   AND tg.genre_id IN (SELECT genre_id FROM target_genres))
    ORDER BY wh.rating DESC LIMIT 1
  )
  SELECT (SELECT title FROM similar_liked),(SELECT id FROM similar_liked),0::bigint,false;
END; $function$;

GRANT ALL ON FUNCTION public.get_why_text(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.toggle_list_like(p_list_id uuid)
 RETURNS TABLE(liked boolean, like_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_exists boolean; v_count bigint; v_owner uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.list_likes WHERE list_id=p_list_id AND user_id=auth.uid()) INTO v_exists;
  IF v_exists THEN DELETE FROM public.list_likes WHERE list_id=p_list_id AND user_id=auth.uid();
  ELSE
    INSERT INTO public.list_likes(list_id,user_id) VALUES(p_list_id,auth.uid());
    SELECT owner_id INTO v_owner FROM public.custom_lists WHERE id=p_list_id;
    PERFORM create_notification(v_owner,'list_like',auth.uid(),NULL,p_list_id,NULL);
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.list_likes WHERE list_id=p_list_id;
  RETURN QUERY SELECT NOT v_exists,v_count;
END; $function$;

GRANT ALL ON FUNCTION public.toggle_list_like(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.titles_missing_embeddings(row_limit integer DEFAULT 100)
 RETURNS TABLE(title_id text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.id
  from titles t
  left join title_embeddings te on te.title_id = t.id
  where te.title_id is null
    and t.overview is not null   -- skip titles with no text to embed
  limit row_limit;
$function$;

GRANT ALL ON FUNCTION public.titles_missing_embeddings(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_titles(query_embedding public.vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(title_id text, similarity double precision)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT
    te.title_id,
    1 - (te.embedding <=> query_embedding) AS similarity
  FROM public.title_embeddings te
  JOIN public.titles t ON t.id = te.title_id
  WHERE 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$function$;

GRANT ALL ON FUNCTION public.match_titles(public.vector, double precision, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_titles(query_embedding public.vector, match_threshold double precision, match_count integer, p_media_type text DEFAULT NULL::text)
 RETURNS TABLE(title_id text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT te.title_id,
         1 - (te.embedding <=> query_embedding) AS similarity
  FROM   title_embeddings te
  JOIN   titles t ON t.id = te.title_id
  WHERE  1 - (te.embedding <=> query_embedding) > match_threshold
    AND  (p_media_type IS NULL OR t.media_type = p_media_type)
  ORDER  BY te.embedding <=> query_embedding
  LIMIT  match_count;
$function$;

GRANT ALL ON FUNCTION public.match_titles(public.vector, double precision, integer, text) TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger wiring auth.users → public.profiles (auto-create profile on signup)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
