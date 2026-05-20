# StreamSocial MCP Server

Custom MCP server exposing app-specific tools for development and operations. Use this with Claude Code to query, debug, and manage your StreamSocial app directly from chat.

## Tools

| Tool | Description |
|------|-------------|
| `app_health` | Snapshot of catalog size, embedding coverage, user counts, recent titles |
| `get_user_stats` | Profile, watch history, lists for a user (by email) |
| `seed_titles` | Trigger TMDB discover (movie/tv) for N pages |
| `backfill_embeddings` | Generate embeddings for unembedded titles |
| `title_lookup` | Full details about one title (metadata, embedding, watch count, lists) |
| `recent_activity` | Last N watch_history entries (hydrated with title names) |
| `search_catalog` | Quick text search of titles table |
| `edge_function_test` | Test any edge function endpoint with a GET request |

## Setup

### 1. Build
```bash
cd mcp-server
npm install
npm run build
```

### 2. Set Service Role Key

Add to root `.env.local`:
```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

Get it from: Supabase Dashboard → Project Settings → API → `service_role` key

> ⚠️ Never commit this key. It bypasses all RLS.

### 3. Auto-loaded via `.mcp.json`

When you launch `claude` from the project root, Claude Code reads `.mcp.json` and starts this server automatically. No manual configuration needed.

## Adding More Tools

1. Add a tool definition to the `TOOLS` array in `src/index.ts`
2. Add a handler function (e.g. `handleMyNewTool`)
3. Wire it up in the `CallToolRequestSchema` switch
4. Rebuild: `npm run build`
5. Restart Claude Code session

## Local Testing

```bash
SUPABASE_URL=https://nwvliipxqedueskhxdym.supabase.co \
SUPABASE_SERVICE_KEY=... \
node dist/index.js
```

The server runs on stdio. Use [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for interactive testing:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
