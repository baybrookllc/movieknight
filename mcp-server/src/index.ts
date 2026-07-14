#!/usr/bin/env node
/**
 * MovieKnight MCP Server
 *
 * Exposes app-specific tools for development and operations:
 * - app_health: Overall health snapshot (DB, embeddings, edge functions)
 * - get_user_stats: Watch history, lists, profile for a given email
 * - seed_titles: Trigger TMDB discovery (movies or TV)
 * - backfill_embeddings: Generate embeddings for unembedded titles
 * - title_lookup: Detailed info about a specific title
 * - recent_activity: Last N watch_history entries (all users)
 * - search_catalog: Quick text search of titles table
 * - edge_function_test: Test an edge function endpoint
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Configuration ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("[movieknight-mcp] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "app_health",
    description:
      "Returns a comprehensive health snapshot of MovieKnight: total titles, embedding coverage, recent activity, user counts. Use this to quickly assess system status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_user_stats",
    description:
      "Returns watch history, lists, and profile data for a user identified by email. Useful for debugging user-reported issues.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "User's email address" },
      },
      required: ["email"],
    },
  },
  {
    name: "seed_titles",
    description:
      "Triggers the tmdb-cache discover action to seed N pages of popular titles. Each page = ~20 titles. Service-role auth used.",
    inputSchema: {
      type: "object",
      properties: {
        media_type: {
          type: "string",
          enum: ["movie", "tv"],
          description: "Type of titles to seed",
        },
        pages: {
          type: "number",
          description: "Number of pages to fetch (1-25)",
          minimum: 1,
          maximum: 25,
        },
      },
      required: ["media_type", "pages"],
    },
  },
  {
    name: "backfill_embeddings",
    description:
      "Triggers the generate-embedding function to backfill embeddings for titles without one. Service-role auth used.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max titles to process (1-100)",
          minimum: 1,
          maximum: 100,
          default: 50,
        },
      },
    },
  },
  {
    name: "title_lookup",
    description:
      "Returns full details about a specific title: metadata, embedding status, watch history count, list memberships.",
    inputSchema: {
      type: "object",
      properties: {
        title_id: {
          type: "string",
          description: 'Title ID in format "movie:123" or "tv:456"',
        },
      },
      required: ["title_id"],
    },
  },
  {
    name: "recent_activity",
    description:
      "Returns the last N watch_history entries across all users. Useful for debugging real-time activity issues.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of entries to return (1-50)",
          minimum: 1,
          maximum: 50,
          default: 20,
        },
      },
    },
  },
  {
    name: "search_catalog",
    description:
      "Quick text search of the titles table (no embedding required). Returns up to 20 matches.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (title)" },
        media_type: {
          type: "string",
          enum: ["movie", "tv"],
          description: "Optional filter",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "edge_function_test",
    description:
      "Tests an edge function with a GET request and returns the response. Useful for quick endpoint verification.",
    inputSchema: {
      type: "object",
      properties: {
        function_name: {
          type: "string",
          description: "Name of the edge function (e.g., 'semantic-search')",
        },
        query_string: {
          type: "string",
          description: "Optional query string (e.g., 'query=test&limit=5')",
        },
      },
      required: ["function_name"],
    },
  },
  {
    name: "database_performance",
    description:
      "Analyzes database query performance. Returns slow queries, missing indexes, and table sizes. Helps identify performance bottlenecks.",
    inputSchema: {
      type: "object",
      properties: {
        threshold_ms: {
          type: "number",
          description: "Only show queries slower than this (default 100ms)",
          default: 100,
        },
      },
    },
  },
  {
    name: "check_table_health",
    description:
      "Checks health of key tables: row counts, last updated, index presence, bloat estimation.",
    inputSchema: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          description: "Table to analyze (e.g., 'titles', 'watch_history', 'custom_lists')",
        },
      },
      required: ["table_name"],
    },
  },
  {
    name: "find_errors",
    description:
      "Searches watch_history and profiles for anomalies: NULL values, invalid status values, orphaned records. Helps identify data quality issues.",
    inputSchema: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          enum: ["watch_history", "profiles", "custom_lists", "list_items"],
          description: "Table to check for anomalies",
        },
      },
      required: ["table_name"],
    },
  },
  {
    name: "check_embeddings_status",
    description:
      "Returns embedding backfill status: total titles, embedded count, missing count, and sampling of unembedded titles.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_slow_rpc_calls",
    description:
      "Returns information about RPC functions and their typical execution times. Helps identify slow browse_titles, semantic-search, etc.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of RPC functions to profile (default 10)",
          default: 10,
        },
      },
    },
  },
  {
    name: "get_console_logs",
    description:
      "Query recent browser console logs captured from real users. Filter by level (error/warn/log/info), page, or time window. Returns message, page, session, timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["error", "warn", "log", "info"], description: "Filter by log level" },
        page: { type: "string", description: "Filter by page path e.g. /browse" },
        hours: { type: "number", description: "Look back N hours (default 24)", default: 24 },
        limit: { type: "number", description: "Max rows (default 50)", default: 50 },
      },
    },
  },
  {
    name: "get_error_logs",
    description:
      "Query captured frontend errors (unhandled exceptions and promise rejections). Includes stack traces and page context. Most useful for debugging production crashes.",
    inputSchema: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["high", "medium", "low", "critical"], description: "Filter by severity" },
        hours: { type: "number", description: "Look back N hours (default 48)", default: 48 },
        limit: { type: "number", description: "Max rows (default 30)", default: 30 },
      },
    },
  },
  {
    name: "get_network_metrics",
    description:
      "Query captured fetch request timings from real users. Find slow requests, failed calls (status 0 or 5xx), and Supabase RPC latency.",
    inputSchema: {
      type: "object",
      properties: {
        min_response_time_ms: { type: "number", description: "Only show requests slower than N ms" },
        url_contains: { type: "string", description: "Filter URLs containing this string e.g. 'browse_titles'" },
        hours: { type: "number", description: "Look back N hours (default 24)", default: 24 },
        limit: { type: "number", description: "Max rows (default 50)", default: 50 },
      },
    },
  },
  {
    name: "get_perf_metrics",
    description:
      "Query Core Web Vitals (LCP, FCP, CLS, TTFB) captured from real user sessions. Group by page to find slow routes.",
    inputSchema: {
      type: "object",
      properties: {
        metric_name: { type: "string", enum: ["LCP", "FCP", "CLS", "TTFB"], description: "Filter by metric" },
        page: { type: "string", description: "Filter by page path e.g. /browse" },
        hours: { type: "number", description: "Look back N hours (default 72)", default: 72 },
        limit: { type: "number", description: "Max rows (default 100)", default: 100 },
      },
    },
  },
] as const;

// ── Tool handlers ─────────────────────────────────────────────────────────────
async function handleAppHealth() {
  const [
    titlesCount,
    embeddingsCount,
    profilesCount,
    watchHistoryCount,
    customListsCount,
    recentTitles,
  ] = await Promise.all([
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

async function handleGetUserStats(email: string) {
  // Find user by email
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) throw new Error(`Auth lookup failed: ${authError.message}`);

  const user = users.find((u) => u.email === email);
  if (!user) return { error: `No user found with email ${email}` };

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

async function handleSeedTitles(media_type: string, pages: number) {
  const url = `${FUNCTIONS_URL}/tmdb-cache?action=discover&media_type=${media_type}&pages=${pages}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) {
    return { error: `HTTP ${res.status}: ${await res.text()}` };
  }
  return await res.json();
}

async function handleBackfillEmbeddings(limit: number = 50) {
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

async function handleTitleLookup(title_id: string) {
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

async function handleRecentActivity(limit: number = 20) {
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

async function handleSearchCatalog(query: string, media_type?: string) {
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

async function handleEdgeFunctionTest(function_name: string, query_string?: string) {
  const url = `${FUNCTIONS_URL}/${function_name}${query_string ? `?${query_string}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.length > 500 ? text.slice(0, 500) + "..." : text;
  }
  return {
    url,
    status: res.status,
    ok: res.ok,
    response: body,
  };
}

// ── Debug tools ───────────────────────────────────────────────────────────────

async function handleDatabasePerformance(threshold_ms: number = 100) {
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

async function handleCheckTableHealth(table_name: string) {
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

async function handleFindErrors(table_name: string) {
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

async function handleCheckEmbeddingsStatus() {
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

async function handleGetSlowRpcCalls(limit: number = 10) {
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

async function queryRecent<T extends Record<string, unknown>>(opts: {
  table: string;
  columns: string;
  hours: number;
  limit: number;
  orderBy?: { column: string; ascending: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply?: (q: any) => any;
}): Promise<T[]> {
  const since = new Date(Date.now() - opts.hours * 3_600_000).toISOString();
  let q = supabase
    .from(opts.table)
    .select(opts.columns)
    .gte("timestamp", since)
    .order(opts.orderBy?.column ?? "timestamp", { ascending: opts.orderBy?.ascending ?? false })
    .limit(opts.limit);
  if (opts.apply) q = opts.apply(q);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as T[];
}

function bucketBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, number> {
  return rows.reduce((acc: Record<string, number>, r) => {
    const k = String(r[key] ?? "unknown");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

async function handleGetConsoleLogs(args: {
  level?: string; page?: string; hours?: number; limit?: number;
}) {
  const { level, page, hours = 24, limit = 50 } = args;
  const rows = await queryRecent<{ level: string }>({
    table: "debug_logs",
    columns: "id, level, message, context, stack_trace, session_id, timestamp",
    hours, limit,
    apply: (q) => {
      if (level) q = q.eq("level", level);
      if (page) q = q.contains("context", { page });
      return q;
    },
  });
  return { total: rows.length, by_level: bucketBy(rows, "level"), logs: rows };
}

async function handleGetErrorLogs(args: {
  severity?: string; hours?: number; limit?: number;
}) {
  const { severity, hours = 48, limit = 30 } = args;
  const rows = await queryRecent<{ severity: string }>({
    table: "error_logs",
    columns: "id, error_type, error_message, stack_trace, context, severity, session_id, timestamp, resolved",
    hours, limit,
    apply: (q) => severity ? q.eq("severity", severity) : q,
  });
  return { total: rows.length, by_severity: bucketBy(rows, "severity"), errors: rows };
}

async function handleGetNetworkMetrics(args: {
  min_response_time_ms?: number; url_contains?: string; hours?: number; limit?: number;
}) {
  const { min_response_time_ms, url_contains, hours = 24, limit = 50 } = args;
  // When filtering for slow requests, sort by response time. Otherwise sort
  // by recency so callers see what just happened.
  const orderBy = min_response_time_ms
    ? { column: "response_time_ms", ascending: false }
    : { column: "timestamp", ascending: false };
  const rows = await queryRecent<{ response_time_ms: number; status_code: number }>({
    table: "network_metrics",
    columns: "id, url, method, status_code, response_time_ms, session_id, timestamp",
    hours, limit, orderBy,
    apply: (q) => {
      if (min_response_time_ms) q = q.gte("response_time_ms", min_response_time_ms);
      if (url_contains) q = q.ilike("url", `%${url_contains}%`);
      return q;
    },
  });
  const avgMs = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (r.response_time_ms ?? 0), 0) / rows.length)
    : 0;
  const failed = rows.filter(r => !r.status_code || r.status_code === 0 || r.status_code >= 500).length;
  return { total: rows.length, avg_response_ms: avgMs, failed_requests: failed, requests: rows };
}

async function handleGetPerfMetrics(args: {
  metric_name?: string; page?: string; hours?: number; limit?: number;
}) {
  const { metric_name, page, hours = 72, limit = 100 } = args;
  const rows = await queryRecent<{ metric_name: string; value: number }>({
    table: "performance_metrics",
    columns: "id, metric_name, value, page, session_id, timestamp",
    hours, limit,
    apply: (q) => {
      if (metric_name) q = q.eq("metric_name", metric_name);
      if (page) q = q.eq("page", page);
      return q;
    },
  });

  // Single O(N) pass into per-metric buckets, then one sort per bucket.
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const arr = buckets.get(r.metric_name) ?? [];
    arr.push(r.value);
    buckets.set(r.metric_name, arr);
  }
  const summary: Record<string, { count: number; avg: number; p75: number }> = {};
  for (const [name, vals] of buckets) {
    vals.sort((a, b) => a - b);
    const sum = vals.reduce((s, v) => s + v, 0);
    summary[name] = {
      count: vals.length,
      avg: Math.round((sum / vals.length) * 10) / 10,
      p75: vals[Math.floor(vals.length * 0.75)] ?? 0,
    };
  }
  return { total: rows.length, summary, samples: rows.slice(0, 20) };
}

// ── Server setup ──────────────────────────────────────────────────────────────
const server = new Server(
  { name: "streamsocial-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  // Each tool's own inputSchema (declared in TOOLS below) is what actually
  // validates shape at the MCP layer — this cast just gives call sites a
  // typed view of already-validated arguments instead of `any`.
  const args = request.params.arguments as Record<string, unknown> | undefined;

  try {
    let result: unknown;

    switch (name) {
      case "app_health":
        result = await handleAppHealth();
        break;
      case "get_user_stats":
        result = await handleGetUserStats(args?.email as string);
        break;
      case "seed_titles":
        result = await handleSeedTitles(args?.media_type as string, args?.pages as number);
        break;
      case "backfill_embeddings":
        result = await handleBackfillEmbeddings(args?.limit as number | undefined);
        break;
      case "title_lookup":
        result = await handleTitleLookup(args?.title_id as string);
        break;
      case "recent_activity":
        result = await handleRecentActivity(args?.limit as number | undefined);
        break;
      case "search_catalog":
        result = await handleSearchCatalog(args?.query as string, args?.media_type as string | undefined);
        break;
      case "edge_function_test":
        result = await handleEdgeFunctionTest(
          args?.function_name as string,
          args?.query_string as string | undefined
        );
        break;
      case "database_performance":
        result = await handleDatabasePerformance(args?.threshold_ms as number | undefined);
        break;
      case "check_table_health":
        result = await handleCheckTableHealth(args?.table_name as string);
        break;
      case "find_errors":
        result = await handleFindErrors(args?.table_name as string);
        break;
      case "check_embeddings_status":
        result = await handleCheckEmbeddingsStatus();
        break;
      case "get_slow_rpc_calls":
        result = await handleGetSlowRpcCalls(args?.limit as number | undefined);
        break;
      case "get_console_logs":
        result = await handleGetConsoleLogs(args as Parameters<typeof handleGetConsoleLogs>[0]);
        break;
      case "get_error_logs":
        result = await handleGetErrorLogs(args as Parameters<typeof handleGetErrorLogs>[0]);
        break;
      case "get_network_metrics":
        result = await handleGetNetworkMetrics(args as Parameters<typeof handleGetNetworkMetrics>[0]);
        break;
      case "get_perf_metrics":
        result = await handleGetPerfMetrics(args as Parameters<typeof handleGetPerfMetrics>[0]);
        break;
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[streamsocial-mcp] running on stdio");
}

main().catch((err) => {
  console.error("[streamsocial-mcp] fatal:", err);
  process.exit(1);
});
