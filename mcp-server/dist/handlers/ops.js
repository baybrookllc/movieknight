import { supabase, FUNCTIONS_URL, SUPABASE_SERVICE_KEY } from "../db.js";
export async function handleAppHealth() {
    const [titlesCount, embeddingsCount, profilesCount, watchHistoryCount, customListsCount, recentTitles,] = await Promise.all([
        supabase.from("titles").select("*", { count: "exact", head: true }),
        supabase.from("title_embeddings").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("watch_history").select("*", { count: "exact", head: true }),
        supabase.from("custom_lists").select("*", { count: "exact", head: true }),
        supabase
            .from("titles")
            .select("id, title, cached_at")
            .order("cached_at", { ascending: false })
            .limit(5),
    ]);
    const titles = titlesCount.count ?? 0;
    const embeddings = embeddingsCount.count ?? 0;
    const coverage = titles > 0 ? ((embeddings / titles) * 100).toFixed(1) : "0";
    return {
        catalog: {
            total_titles: titles,
            titles_with_embeddings: embeddings,
            embedding_coverage_pct: `${coverage}%`,
        },
        users: {
            total_profiles: profilesCount.count ?? 0,
            total_watch_history_entries: watchHistoryCount.count ?? 0,
            total_custom_lists: customListsCount.count ?? 0,
        },
        recent_titles: recentTitles.data ?? [],
        timestamp: new Date().toISOString(),
    };
}
export async function handleGetUserStats(email) {
    // Find user by email
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError)
        throw new Error(`Auth lookup failed: ${authError.message}`);
    const user = users.find((u) => u.email === email);
    if (!user)
        return { error: `No user found with email ${email}` };
    const [profile, watchHistory, lists, listMemberships] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
            .from("watch_history")
            .select("title_id, status, rating, episode_season, episode_number, watched_at")
            .eq("user_id", user.id)
            .order("watched_at", { ascending: false })
            .limit(20),
        supabase.from("custom_lists").select("*").eq("owner_id", user.id),
        supabase.from("list_members").select("list_id, role").eq("user_id", user.id),
    ]);
    return {
        user_id: user.id,
        email: user.email,
        created_at: user.created_at,
        profile: profile.data,
        recent_watch_history: watchHistory.data ?? [],
        watch_history_count: (watchHistory.data ?? []).length,
        owned_lists: lists.data ?? [],
        shared_list_memberships: listMemberships.data ?? [],
    };
}
export async function handleSeedTitles(media_type, pages) {
    const url = `${FUNCTIONS_URL}/tmdb-cache?action=discover&media_type=${media_type}&pages=${pages}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!res.ok) {
        return { error: `HTTP ${res.status}: ${await res.text()}` };
    }
    return await res.json();
}
export async function handleBackfillEmbeddings(limit = 50) {
    const res = await fetch(`${FUNCTIONS_URL}/generate-embedding`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ backfill: true, limit }),
    });
    if (!res.ok) {
        return { error: `HTTP ${res.status}: ${await res.text()}` };
    }
    return await res.json();
}
export async function handleEdgeFunctionTest(function_name, query_string) {
    const url = `${FUNCTIONS_URL}/${function_name}${query_string ? `?${query_string}` : ""}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const text = await res.text();
    let body;
    try {
        body = JSON.parse(text);
    }
    catch {
        body = text.length > 500 ? text.slice(0, 500) + "..." : text;
    }
    return {
        url,
        status: res.status,
        ok: res.ok,
        response: body,
    };
}
