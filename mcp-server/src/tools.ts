// ── Tool definitions ──────────────────────────────────────────────────────────
// Each tool's inputSchema is what validates shape at the MCP layer.
export const TOOLS = [
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
