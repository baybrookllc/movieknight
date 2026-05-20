-- Community watchlists: list_ratings table + 3 RPCs + list_members RLS
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. list_ratings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.list_ratings (
  list_id   uuid      NOT NULL REFERENCES public.custom_lists(id) ON DELETE CASCADE,
  user_id   uuid      NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  rating    smallint  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  rated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);

ALTER TABLE public.list_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read list ratings"
  ON public.list_ratings FOR SELECT USING (true);

-- Authenticated users can rate any public list they don't own
CREATE POLICY "Authenticated users can rate public lists they dont own"
  ON public.list_ratings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.custom_lists
      WHERE id = list_id
        AND is_public = true
        AND owner_id <> auth.uid()
    )
  );

CREATE POLICY "Users can update own list rating"
  ON public.list_ratings FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own list rating"
  ON public.list_ratings FOR DELETE USING (auth.uid() = user_id);

-- ── 2. get_list_rating — anonymous aggregate ───────────────────────
CREATE OR REPLACE FUNCTION public.get_list_rating(p_list_id uuid)
RETURNS TABLE (avg_rating numeric, rating_count bigint)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    ROUND(AVG(rating::numeric), 1) AS avg_rating,
    COUNT(*)::bigint               AS rating_count
  FROM public.list_ratings
  WHERE list_id = p_list_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_list_rating(uuid) TO anon, authenticated;

-- ── 3. find_user_by_username — for share flow ──────────────────────
CREATE OR REPLACE FUNCTION public.find_user_by_username(p_username text)
RETURNS TABLE (id uuid, display_name text, username text, avatar_url text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, display_name, username, avatar_url
  FROM public.profiles
  WHERE lower(username) = lower(trim(p_username))
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_user_by_username(text) TO authenticated;

-- ── 4. get_community_lists — enriched public list feed ────────────
CREATE OR REPLACE FUNCTION public.get_community_lists(
  p_limit  int  DEFAULT 20,
  p_offset int  DEFAULT 0,
  p_sort   text DEFAULT 'top_rated'
)
RETURNS TABLE (
  id                 uuid,
  title              text,
  description        text,
  owner_id           uuid,
  created_at         timestamptz,
  item_count         bigint,
  avg_rating         numeric,
  rating_count       bigint,
  owner_username     text,
  owner_display_name text,
  owner_avatar_url   text,
  cover_poster_paths text[]
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_order text;
BEGIN
  -- Validate sort to prevent injection (ELSE catches anything unknown → top_rated)
  v_order := CASE p_sort
    WHEN 'newest'      THEN 'cl.created_at DESC'
    WHEN 'most_titles' THEN 'COUNT(DISTINCT li.id) DESC, cl.created_at DESC'
    ELSE                    'ROUND(AVG(lr.rating::numeric),1) DESC NULLS LAST, COUNT(DISTINCT lr.user_id) DESC, cl.created_at DESC'
  END;

  RETURN QUERY EXECUTE format(
    'SELECT
       cl.id,
       cl.title,
       cl.description,
       cl.owner_id,
       cl.created_at,
       COUNT(DISTINCT li.id)::bigint                AS item_count,
       ROUND(AVG(lr.rating::numeric), 1)            AS avg_rating,
       COUNT(DISTINCT lr.user_id)::bigint           AS rating_count,
       p.username                                   AS owner_username,
       p.display_name                               AS owner_display_name,
       p.avatar_url                                 AS owner_avatar_url,
       ARRAY(
         SELECT t.poster_path
         FROM public.list_items sub_li
         JOIN public.titles t ON t.id = sub_li.title_id
         WHERE sub_li.list_id = cl.id
           AND t.poster_path IS NOT NULL
         ORDER BY sub_li.added_at ASC
         LIMIT 3
       ) AS cover_poster_paths
     FROM public.custom_lists cl
     LEFT JOIN public.list_items   li ON li.list_id = cl.id
     LEFT JOIN public.list_ratings lr ON lr.list_id = cl.id
     LEFT JOIN public.profiles      p ON p.id       = cl.owner_id
     WHERE cl.is_public = true
     GROUP BY cl.id, cl.title, cl.description, cl.owner_id, cl.created_at,
              p.username, p.display_name, p.avatar_url
     ORDER BY %s
     LIMIT $1 OFFSET $2',
    v_order
  ) USING p_limit, p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_community_lists(int, int, text) TO anon, authenticated;

-- ── 5. list_members RLS (owner management + member read) ──────────
ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'list_members'
      AND policyname = 'Owners can manage members'
  ) THEN
    CREATE POLICY "Owners can manage members"
      ON public.list_members FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.custom_lists
          WHERE id = list_id AND owner_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.custom_lists
          WHERE id = list_id AND owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'list_members'
      AND policyname = 'Members can view own memberships'
  ) THEN
    CREATE POLICY "Members can view own memberships"
      ON public.list_members FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;
