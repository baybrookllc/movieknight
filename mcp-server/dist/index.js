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
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./tools.js";
import { handleAppHealth, handleGetUserStats, handleSeedTitles, handleBackfillEmbeddings, handleEdgeFunctionTest, } from "./handlers/ops.js";
import { handleTitleLookup, handleRecentActivity, handleSearchCatalog, } from "./handlers/catalog.js";
import { handleDatabasePerformance, handleCheckTableHealth, handleFindErrors, handleCheckEmbeddingsStatus, handleGetSlowRpcCalls, } from "./handlers/debug.js";
import { handleGetConsoleLogs, handleGetErrorLogs, handleGetNetworkMetrics, handleGetPerfMetrics, } from "./handlers/telemetry.js";
// ── Server setup ──────────────────────────────────────────────────────────────
const server = new Server({ name: "streamsocial-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    // Each tool's own inputSchema (declared in tools.ts) is what actually
    // validates shape at the MCP layer — this cast just gives call sites a
    // typed view of already-validated arguments instead of `any`.
    const args = request.params.arguments;
    try {
        let result;
        switch (name) {
            case "app_health":
                result = await handleAppHealth();
                break;
            case "get_user_stats":
                result = await handleGetUserStats(args?.email);
                break;
            case "seed_titles":
                result = await handleSeedTitles(args?.media_type, args?.pages);
                break;
            case "backfill_embeddings":
                result = await handleBackfillEmbeddings(args?.limit);
                break;
            case "title_lookup":
                result = await handleTitleLookup(args?.title_id);
                break;
            case "recent_activity":
                result = await handleRecentActivity(args?.limit);
                break;
            case "search_catalog":
                result = await handleSearchCatalog(args?.query, args?.media_type);
                break;
            case "edge_function_test":
                result = await handleEdgeFunctionTest(args?.function_name, args?.query_string);
                break;
            case "database_performance":
                result = await handleDatabasePerformance(args?.threshold_ms);
                break;
            case "check_table_health":
                result = await handleCheckTableHealth(args?.table_name);
                break;
            case "find_errors":
                result = await handleFindErrors(args?.table_name);
                break;
            case "check_embeddings_status":
                result = await handleCheckEmbeddingsStatus();
                break;
            case "get_slow_rpc_calls":
                result = await handleGetSlowRpcCalls(args?.limit);
                break;
            case "get_console_logs":
                result = await handleGetConsoleLogs(args);
                break;
            case "get_error_logs":
                result = await handleGetErrorLogs(args);
                break;
            case "get_network_metrics":
                result = await handleGetNetworkMetrics(args);
                break;
            case "get_perf_metrics":
                result = await handleGetPerfMetrics(args);
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
    }
    catch (err) {
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
