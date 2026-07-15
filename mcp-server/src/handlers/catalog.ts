import { supabase } from "../db.js";

export async function handleTitleLookup(title_id: string) {
  const [title, embedding, watchCount, listMemberships] = await Promise.all([
    supabase.from("titles").select("*").eq("id", title_id).maybeSingle(),
    supabase
      .from("title_embeddings")
      .select("embedded_at")
      .eq("title_id", title_id)
      .maybeSingle(),
    supabase
      .from("watch_history")
      .select("*", { count: "exact", head: true })
      .eq("title_id", title_id),
    supabase
      .from("list_items")
      .select("list_id, custom_lists(title)")
      .eq("title_id", title_id),
  ]);

  if (!title.data) return { error: `Title ${title_id} not found` };

  return {
    metadata: title.data,
    has_embedding: !!embedding.data,
    embedded_at: embedding.data?.embedded_at ?? null,
    watch_history_count: watchCount.count ?? 0,
    list_memberships: listMemberships.data ?? [],
  };
}

export async function handleRecentActivity(limit: number = 20) {
  const { data, error } = await supabase
    .from("watch_history")
    .select("user_id, title_id, status, rating, episode_season, episode_number, watched_at")
    .order("watched_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  // Hydrate with title names
  const titleIds = [...new Set((data ?? []).map((r) => r.title_id))];
  const { data: titles } = await supabase
    .from("titles")
    .select("id, title, media_type")
    .in("id", titleIds);

  const titleMap = new Map((titles ?? []).map((t) => [t.id, t]));

  return {
    activity: (data ?? []).map((row) => ({
      ...row,
      title: titleMap.get(row.title_id)?.title ?? "?",
      media_type: titleMap.get(row.title_id)?.media_type ?? "?",
    })),
  };
}

export async function handleSearchCatalog(query: string, media_type?: string) {
  let q = supabase
    .from("titles")
    .select("id, title, media_type, release_date, vote_average")
    .ilike("title", `%${query}%`)
    .order("popularity", { ascending: false })
    .limit(20);
  if (media_type) q = q.eq("media_type", media_type);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { matches: data ?? [], count: (data ?? []).length };
}
