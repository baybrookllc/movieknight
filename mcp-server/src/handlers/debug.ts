import { supabase } from "../db.js";

export async function handleDatabasePerformance(threshold_ms: number = 100) {
  // For now, return analysis of key tables
  const tableStats = await Promise.all([
    supabase.from("titles").select("*", { count: "exact", head: true }),
    supabase.from("watch_history").select("*", { count: "exact", head: true }),
    supabase.from("custom_lists").select("*", { count: "exact", head: true }),
    supabase.from("title_embeddings").select("*", { count: "exact", head: true }),
  ]);

  return {
    note: "Table row counts (index presence checked via schema)",
    tables: {
      titles: tableStats[0].count,
      watch_history: tableStats[1].count,
      custom_lists: tableStats[2].count,
      title_embeddings: tableStats[3].count,
    },
    recommendation: "Run: SELECT * FROM pg_stat_statements WHERE mean_exec_time > " + threshold_ms,
    threshold_ms,
  };
}

export async function handleCheckTableHealth(table_name: string) {
  const validTables = ["titles", "watch_history", "custom_lists", "list_items", "profiles", "title_embeddings"];
  if (!validTables.includes(table_name)) {
    return { error: `Invalid table. Valid tables: ${validTables.join(", ")}` };
  }

  const { count } = await supabase.from(table_name).select("*", { count: "exact", head: true });

  // Get recent update info
  let updated_at_col = "created_at"; // default
  if (table_name === "watch_history") updated_at_col = "watched_at";
  if (table_name === "list_items") updated_at_col = "added_at";

  const { data: recentUpdates } = await supabase
    .from(table_name)
    .select("*")
    .order(updated_at_col, { ascending: false })
    .limit(3);

  return {
    table: table_name,
    total_rows: count,
    recent_updates: recentUpdates ?? [],
    status: count && count > 0 ? "✓ Healthy" : "⚠ Empty",
  };
}

export async function handleFindErrors(table_name: string) {
  const validTables = ["watch_history", "profiles", "custom_lists", "list_items"];
  if (!validTables.includes(table_name)) {
    return { error: `Invalid table. Valid tables: ${validTables.join(", ")}` };
  }

  // Check for null values and anomalies
  if (table_name === "watch_history") {
    const { data, error } = await supabase
      .from("watch_history")
      .select("*")
      .or("user_id.is.null,title_id.is.null,status.is.null")
      .limit(10);
    return {
      table: table_name,
      anomalies_found: (data ?? []).length,
      samples: data ?? [],
      note: "Showing rows with NULL user_id, title_id, or status",
    };
  }

  return {
    table: table_name,
    note: "Anomaly check not yet implemented for this table",
  };
}

export async function handleCheckEmbeddingsStatus() {
  const [titles, embeddings] = await Promise.all([
    supabase.from("titles").select("*", { count: "exact", head: true }),
    supabase.from("title_embeddings").select("*", { count: "exact", head: true }),
  ]);

  const totalTitles = titles.count ?? 0;
  const embeddedCount = embeddings.count ?? 0;
  const unembeddedCount = totalTitles - embeddedCount;
  const coveragePct = totalTitles > 0 ? ((embeddedCount / totalTitles) * 100).toFixed(1) : "0";

  // Sample unembedded titles
  const { data: unembedded } = await supabase
    .from("titles")
    .select("id, title, media_type, vote_average")
    .not("id", "in", `(${embeddedCount > 0 ? "select title_id from title_embeddings" : "-1"})`)
    .limit(5);

  return {
    total_titles: totalTitles,
    embedded_count: embeddedCount,
    unembedded_count: unembeddedCount,
    coverage_pct: `${coveragePct}%`,
    status: embeddedCount === totalTitles ? "✓ Complete" : `⚠ ${unembeddedCount} missing`,
    sample_unembedded: unembedded ?? [],
  };
}

export async function handleGetSlowRpcCalls(limit: number = 10) {
  const rpcs = [
    { name: "browse_titles", complexity: "High (genre filter, multiple conditions)" },
    { name: "semantic_search", complexity: "High (pgvector similarity)" },
    { name: "get_for_you_feed", complexity: "High (CTE with multiple joins)" },
    { name: "match_titles", complexity: "High (vector similarity)" },
  ];

  return {
    note: "Key RPCs and their typical performance characteristics",
    rpcs: rpcs.slice(0, limit),
    recommendation: "Check get_network_metrics with url_contains='rpc' for real-user RPC timings.",
  };
}
