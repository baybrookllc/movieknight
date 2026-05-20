# StreamSocial AI Feature — Ask Claude

An in-app AI assistant powered by Claude. Helps users with personalized recommendations, taste analysis, and answering questions about titles.

---

## Where It Appears

| Location | Modes Available |
|----------|-----------------|
| **Title detail page** | `why_watch`, `similar` + free-form |
| **Profile page** | `taste`, `similar` + free-form |

Users must be **logged in** to use the feature (rate limit enforced per user).

---

## Modes

### `why_watch`
"Why might I like this title?"
- Compares the title against the user's watch history
- Returns 2-3 sentences explaining the connection
- Best for impulse buys and discovery

### `similar`
"Suggest 5 similar titles"
- Returns a list of 5 titles formatted as **Title (Year)** with one-sentence justification
- Filters out titles already in user's watch history
- Best for finding new content

### `taste`
"Analyze my taste"
- Reviews user's recent watch history (last 20 watched/watching)
- Returns 2-3 sentences describing taste patterns
- Best for self-discovery / profile insights

### `free`
Free-form question (max 500 chars)
- Includes title context (if on detail page) + watch history
- Best for ad-hoc questions

---

## API Route

`POST /api/claude/ask`

### Request

```json
{
  "question": "Why should I watch this?",
  "title_id": "movie:550",
  "mode": "why_watch"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `question` | string | Yes | Max 500 chars |
| `title_id` | string | No | Format `movie:123` or `tv:456` |
| `mode` | string | No | `why_watch` \| `similar` \| `taste` \| `free` (default: `free`) |

### Response

```json
{
  "answer": "Based on your love for Fight Club and The Matrix, you'll likely appreciate this film's...",
  "mode": "why_watch",
  "usage": {
    "input_tokens": 245,
    "output_tokens": 87
  }
}
```

### Error responses

| Status | Reason |
|--------|--------|
| `401` | Not authenticated |
| `400` | Invalid question (empty or >500 chars) |
| `429` | Rate limit exceeded (10 req/min per user) |
| `500` | Server error or `ANTHROPIC_API_KEY` not configured |

---

## Setup

### 1. Get an Anthropic API Key

1. Visit https://console.anthropic.com/
2. Create a new API key
3. Copy the key (starts with `sk-ant-...`)

### 2. Add to Vercel

```bash
vercel env add ANTHROPIC_API_KEY production
# Paste the key when prompted
# Repeat for `development` and `preview` environments

# Redeploy to pick up the new env var
vercel deploy --prod
```

Or via the Vercel Dashboard:
- Project Settings → Environment Variables
- Add `ANTHROPIC_API_KEY` for Production + Preview + Development

### 3. Local development

Add to `.env.local`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Cost Estimate

Using Claude Haiku 4.5 (`claude-haiku-4-5`):
- Input: $1 per 1M tokens
- Output: $5 per 1M tokens

**Average request:**
- Input: ~400 tokens (system + question + history context)
- Output: ~150 tokens (response)
- Cost: ~$0.0012 per request

**Monthly estimate for 1000 active users × 5 requests:**
- 5000 requests × $0.0012 = **$6/month**

Rate limiting (10 req/min/user) caps maximum spend.

---

## Architecture

```
[User clicks "Why watch"]
        ↓
[AskClaude component]
        ↓
POST /api/claude/ask
        ↓
[Verify Supabase JWT]
        ↓
[Check rate limit (in-memory)]
        ↓
[Fetch title metadata from titles]
[Fetch user's last 20 watch_history entries with title names]
        ↓
[Build prompt with mode template]
        ↓
[Call Anthropic API — claude-haiku-4-5]
        ↓
[Return answer to client]
```

---

## Customization

### Change the model
Edit `app/api/claude/ask/route.ts`:
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6', // for higher quality / cost
  // model: 'claude-haiku-4-5', // for speed / lower cost (default)
  ...
});
```

### Adjust response length
```typescript
max_tokens: 600, // increase for longer responses
```

### Modify system prompt
Edit the `SYSTEM_PROMPT` constant in the API route.

### Add new modes
1. Add to `Mode` type in `components/AskClaude.tsx`
2. Add label/icon to `MODE_LABELS`
3. Add prompt template in `app/api/claude/ask/route.ts`

---

## Privacy & Safety

- **No conversation history stored** — each request is independent
- **No user data leaves your infrastructure** unencrypted — only the constructed prompt is sent to Anthropic
- **Watch history is summarized** in the prompt (titles only, no PII)
- **Rate limiting** prevents abuse
- **Auth gate** prevents anonymous usage

---

## Future Enhancements

- [ ] Conversation memory (multi-turn chat)
- [ ] Streaming responses for faster perceived latency
- [ ] Image generation (poster mood boards)
- [ ] Voice input
- [ ] Smart list generation ("Build me a 10-film list of 90s neo-noir")
- [ ] Watch party planner (recommend based on all participants' tastes)
