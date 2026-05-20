# StreamSocial MCP Stack

This project uses **Model Context Protocol (MCP) servers** to let Claude Code understand and interact with the running infrastructure directly. With these set up, every dev session in this project becomes faster — Claude can query the DB, check deployments, and trigger app-specific operations without asking you to copy-paste.

---

## Configured Servers

### 1. Supabase MCP (Official, `@supabase/mcp-server-supabase`)

Provides Claude direct access to your Supabase project.

**Capabilities:**
- Query database tables (read-only)
- Inspect schema and RLS policies
- View migration history
- Read function definitions

**Read-only mode** is enabled by default for safety.

### 2. Vercel MCP (Official, `https://mcp.vercel.com`)

Provides Claude access to Vercel deployments.

**Capabilities:**
- Check deployment status
- Read deployment logs
- Inspect environment variables (names only, not values)
- View project configuration

### 3. StreamSocial MCP (Custom, `mcp-server/`)

App-specific tools tailored to this codebase.

| Tool | Description |
|------|-------------|
| `app_health` | Catalog size, embedding coverage, user counts |
| `get_user_stats` | Profile, watch history, lists for a user (by email) |
| `seed_titles` | Trigger TMDB discover for N pages |
| `backfill_embeddings` | Generate embeddings for unembedded titles |
| `title_lookup` | Full details about one title |
| `recent_activity` | Last N watch_history entries (hydrated) |
| `search_catalog` | Text search of titles table |
| `edge_function_test` | Quick GET test of an edge function |

---

## Setup

### Step 1: Create API keys

#### Supabase Personal Access Token (PAT)
1. Go to https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Name: `StreamSocial MCP` (or similar)
4. Copy the token

#### Already configured (no action needed):
- Vercel MCP — uses your existing Vercel login
- StreamSocial MCP — uses your Supabase service role key

### Step 2: Add to `.env.local`

```bash
# Supabase MCP authentication
SUPABASE_ACCESS_TOKEN=sbp_...

# StreamSocial MCP (service role key — bypasses RLS)
# Get from: Supabase Dashboard → Project Settings → API → service_role key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

> ⚠️ Never commit `.env.local`. Both keys are sensitive.

### Step 3: Build the custom MCP

```bash
cd mcp-server
npm install
npm run build
```

### Step 4: Restart Claude Code

Claude reads `.mcp.json` on startup. Restart your session to pick up the configuration.

---

## Configuration File

`.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--read-only",
        "--project-ref=nwvliipxqedueskhxdym"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    },
    "streamsocial": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "${NEXT_PUBLIC_SUPABASE_URL}",
        "SUPABASE_SERVICE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}",
        "TMDB_API_KEY": "${TMDB_API_KEY}"
      }
    }
  }
}
```

---

## What Claude Can Now Do

**Before MCP:**
> You: "Browse is broken"
> Claude: "Run this SQL in the dashboard and paste the result..."
> You: *opens dashboard, runs query, copies result*
> Claude: "OK, now run this other query..."

**After MCP:**
> You: "Browse is broken"
> Claude: *queries Supabase via MCP, finds the issue, fixes it, verifies the fix worked*
> Claude: "Fixed. The `browse_titles` RPC was missing `p_platform_ids`. Migration applied."

---

## Security Notes

- **Supabase MCP** runs in **read-only mode** by default. No mutations possible.
- **StreamSocial MCP** has **mutation capabilities** (seed_titles, backfill_embeddings) but uses the service role key locally — never expose this key.
- **Vercel MCP** can read deployment logs but not modify production state without explicit confirmation.

All three servers run **locally on your machine** — no data leaves your network except for the standard API calls Claude makes to Supabase and Vercel that you'd make anyway.

---

## Verifying It Works

After restart, in a new Claude Code session:

```
You: "What's the catalog status?"

Claude: *calls streamsocial.app_health*
Claude: "Catalog has 730 titles, 728 embedded (99.7% coverage).
        Last title cached: Chungking Express (2 hours ago).
        12 active users, 1,247 watch_history entries, 89 custom lists."
```

If you don't see Claude calling the tools, double-check:
1. `claude mcp list` shows the servers as connected (not "Needs authentication")
2. `.env.local` has `SUPABASE_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` set
3. `mcp-server/dist/index.js` exists (run `npm run build` in mcp-server/)

---

## Extending the Custom MCP

To add a new tool to the StreamSocial MCP:

1. Edit `mcp-server/src/index.ts`
2. Add a tool definition to the `TOOLS` array
3. Add a handler function
4. Wire it into the `CallToolRequestSchema` switch
5. Rebuild: `npm run build`
6. Restart Claude Code

Example new tool:

```typescript
// In TOOLS array:
{
  name: "list_failed_embeddings",
  description: "Returns titles where embedding generation has failed",
  inputSchema: { type: "object", properties: {} },
}

// Handler:
async function handleListFailedEmbeddings() {
  const { data } = await supabase
    .from('titles')
    .select('id, title')
    .not('id', 'in', supabase.from('title_embeddings').select('title_id'))
    .order('cached_at', { ascending: false });
  return { failed: data ?? [] };
}

// In switch:
case "list_failed_embeddings":
  result = await handleListFailedEmbeddings();
  break;
```
