/**
 * POST /api/claude/ask
 *
 * In-app Claude assistant. Accepts a question about a title (or general query)
 * and returns a thoughtful response using the authenticated user's watch history
 * as context for personalization.
 *
 * Body: { question: string, title_id?: string, mode?: 'why_watch' | 'similar' | 'free' }
 *
 * Auth: Requires valid Supabase JWT (uses cookie from Supabase SSR).
 * Rate limit: 10 requests / minute per user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';

// In-memory rate limiter (per-user, 10 req/min).
// NOTE: resets on cold start — effective for warm instances but bypassable via
// cold-start cycling. Replace with Upstash Redis for hard enforcement.
const RL_MAX = 10;
const RL_WINDOW_MS = 60_000;
const rlStore = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rlStore.get(userId);
  if (!entry || now - entry.windowStart > RL_WINDOW_MS) {
    rlStore.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RL_MAX) return false;
  entry.count++;
  return true;
}

const SYSTEM_PROMPT = `You are a movie and TV recommendation assistant for StreamSocial, a tracking app. You help users understand titles, find similar content, and explore their taste.

Guidelines:
- Be concise (2-4 sentences for most responses, unless asked for a list)
- Be specific and reference plot/themes/actors when relevant
- Don't include spoilers
- For recommendations, suggest specific titles by name (formatted as **Title (Year)**)
- For taste analysis, focus on patterns: genres, eras, themes, tones
- Never invent fake titles or fake plot details
- If unsure about specific facts, say so rather than guessing`;

export async function POST(req: NextRequest) {
  try {
    // ── 1. Authenticate via Supabase JWT cookie ────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── 2. Rate limit ─────────────────────────────────────────────────────
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a minute.' },
        { status: 429 }
      );
    }

    // ── 3. Parse & validate ────────────────────────────────────────────────
    const body = await req.json();
    const question = String(body.question ?? '').trim();
    const titleId = body.title_id ? String(body.title_id) : null;
    const mode = body.mode === 'why_watch' || body.mode === 'similar' || body.mode === 'taste'
      ? body.mode
      : 'free';

    if (!question || question.length > 500) {
      return NextResponse.json(
        { error: 'Question is required (max 500 chars)' },
        { status: 400 }
      );
    }

    // ── 4. Build context from user's data ────────────────────────────────
    let titleContext = '';
    if (titleId && /^(movie|tv):\d{1,9}$/.test(titleId)) {
      const { data: title } = await supabase
        .from('titles')
        .select('title, overview, release_date, media_type, vote_average, runtime, origin_country, original_language')
        .eq('id', titleId)
        .maybeSingle();
      if (title) {
        titleContext = `\n\nThe user is asking about this title:
Title: ${title.title}
Type: ${title.media_type === 'movie' ? 'Movie' : 'TV Series'}
Released: ${title.release_date ?? 'Unknown'}
Rating: ${title.vote_average ?? 'N/A'}/10
${title.runtime ? `Runtime: ${title.runtime} min\n` : ''}Overview: ${title.overview ?? 'No overview available'}`;
      }
    }

    // Fetch user's recent watch history (last 20 watched/rated)
    const { data: history } = await supabase
      .from('watch_history')
      .select('title_id, status, rating')
      .eq('user_id', user.id)
      .in('status', ['watched', 'watching'])
      .order('watched_at', { ascending: false })
      .limit(20);

    let historyContext = '';
    if (history && history.length > 0) {
      const titleIds = history.map((h) => h.title_id);
      const { data: titles } = await supabase
        .from('titles')
        .select('id, title, media_type')
        .in('id', titleIds);
      const titleMap = new Map((titles ?? []).map((t) => [t.id, t]));
      const watched = history
        .map((h) => {
          const t = titleMap.get(h.title_id);
          if (!t) return null;
          const stars = h.rating ? ` (${(h.rating / 2).toFixed(1)}★)` : '';
          return `- ${t.title} [${t.media_type}]${stars}`;
        })
        .filter(Boolean)
        .join('\n');
      if (watched) {
        historyContext = `\n\nUser's recent watch history (for personalization):\n${watched}`;
      }
    }

    // ── 5. Build mode-specific user message ────────────────────────────────
    let userMessage = question;
    if (mode === 'why_watch') {
      userMessage = `Based on my watch history, why might I enjoy this title? Keep it to 2-3 sentences. Focus on connections to titles I've already watched.${titleContext}${historyContext}`;
    } else if (mode === 'similar') {
      userMessage = `Suggest 5 titles similar to this one that I haven't already watched. Format each as **Title (Year)** followed by one short sentence on why it's similar.${titleContext}${historyContext}`;
    } else if (mode === 'taste') {
      userMessage = `Analyze my taste in films and TV based on my watch history. Write 2-3 sentences describing patterns you see (genres, eras, themes, tones, what I might be drawn to). Be specific and insightful.${historyContext}`;
    } else {
      userMessage = `${question}${titleContext}${historyContext}`;
    }

    // ── 6. Call Claude ────────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return NextResponse.json({
      answer: text,
      mode,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    console.error('[claude/ask]', err);
    const isDev = process.env.NODE_ENV === 'development';
    const msg = isDev && err instanceof Error ? err.message : 'Failed to generate response';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
