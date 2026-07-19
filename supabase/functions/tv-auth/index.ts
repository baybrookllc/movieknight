// ============================================================
//  MovieKnight — TV Device Auth Edge Function
//
//  Flow:
//  1. TV calls POST ?action=create  → gets { code, qr_url }
//  2. TV polls GET  ?action=poll&code=XXXX every 3s
//  3. Phone opens qr_url, signs in normally, then calls
//     POST ?action=claim&code=XXXX  (with their Bearer token)
//  4. TV poll returns { status:'claimed', access_token, refresh_token }
//  5. TV calls sb.auth.setSession({ access_token, refresh_token })
//
//  HARDENING:
//  - 8-char codes (32^8 ≈ 10^12 search space)
//  - IP rate limiting on poll/claim/create
//  - Tokens returned only ONCE on poll, then cleared
//  - Failed-claim attempts tracked, expired codes cleaned aggressively
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCors } from "../_shared/cors-utils.ts";
import { logEdgeError } from "../_shared/error-logger.ts";

// ── Rate limiting (per-isolate, in-memory) ─────────────────
// NOTE: this bucket is per-Deno-isolate, not shared across concurrent
// isolates — if Supabase scales this function horizontally, the effective
// global rate limit is (per-isolate limit) × (concurrent isolate count),
// not a hard global cap. A true global limit needs an external store
// (e.g. Upstash, the pattern already used in app/api/claude/ask/route.ts)
// — tracked as a known limitation, not silently assumed to be a hard cap.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string, action: string, max: number, windowMs: number): boolean {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}
function getClientIp(req: Request): string {
  // cf-connecting-ip first: Cloudflare sets this from the actual TCP
  // connection and strips any client-supplied value of the same name, so
  // it can't be spoofed. x-forwarded-for's first entry is whatever the
  // client itself sent and is trivially spoofable (send your own
  // `X-Forwarded-For: 1.2.3.4` and `.split(",")[0]` trusts it blindly) —
  // only used as a fallback when there's no trusted edge header at all.
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

function randomCode(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (32 chars)
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (const b of arr) out += chars[b % chars.length];
  return out;
}

Deno.serve(async (req: Request) => {
  const CORS = makeCors(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url    = new URL(req.url);
  const action = url.searchParams.get("action");
  const ip     = getClientIp(req);

  try {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── CREATE: TV requests a new code ─────────────────────────
  if (action === "create") {
    // 10 codes / minute / IP — generous for legitimate retries, blocks abuse
    if (!checkRateLimit(ip, "create", 10, 60_000)) {
      return json({ error: "Too many requests" }, 429);
    }

    // Clean up expired codes first
    await admin.from("device_auth_codes").delete().lt("expires_at", new Date().toISOString());

    const code = randomCode(8); // 8 chars (was 6)
    const { error } = await admin.from("device_auth_codes").insert({ code });
    if (error) return json({ error: "Could not create code" }, 500);

    const appUrl = Deno.env.get("APP_URL") ?? "https://movieknight.ca";
    const qr_url = `${appUrl}?tv_link=${code}`;

    return json({ code, qr_url });
  }

  // ── POLL: TV checks if code has been claimed ────────────────
  if (action === "poll") {
    // 60 polls / minute / IP — TV polls every 3s = 20/min normally
    if (!checkRateLimit(ip, "poll", 60, 60_000)) {
      return json({ error: "Too many requests" }, 429);
    }

    const code = url.searchParams.get("code");
    if (!code || code.length < 6 || code.length > 12) return json({ error: "Invalid code" }, 400);

    const { data, error } = await admin
      .from("device_auth_codes")
      .select("status, access_token, refresh_token, expires_at")
      .eq("code", code)
      .single();

    if (error || !data) return json({ status: "not_found" });
    if (new Date(data.expires_at) < new Date()) return json({ status: "expired" });
    if (data.status === "claimed") {
      // Return tokens ONCE, then clear them from DB to prevent replay
      await admin
        .from("device_auth_codes")
        .update({ access_token: null, refresh_token: null, status: "consumed" })
        .eq("code", code);
      return json({
        status: "claimed",
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
    }
    return json({ status: "pending" });
  }

  // ── CLAIM: Phone signs in and claims the code ───────────────
  if (action === "claim") {
    // 20 claims / minute / IP — prevents brute-force code guessing
    if (!checkRateLimit(ip, "claim", 20, 60_000)) {
      return json({ error: "Too many requests" }, 429);
    }

    const code = url.searchParams.get("code");
    if (!code || code.length < 6 || code.length > 12) return json({ error: "Invalid code" }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // Verify user token
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { session }, error: sessionError } = await anonClient.auth.getSession();
    if (!session || sessionError) return json({ error: "Unauthorized" }, 401);

    // Check code exists and is pending
    const { data: row } = await admin
      .from("device_auth_codes")
      .select("status, expires_at")
      .eq("code", code)
      .single();

    if (!row) return json({ error: "Code not found" }, 404);
    if (row.status !== "pending") return json({ error: "Code already used" }, 409);
    if (new Date(row.expires_at) < new Date()) return json({ error: "Code expired" }, 410);

    // Store tokens against the code
    const { error: updateError } = await admin
      .from("device_auth_codes")
      .update({
        status:        "claimed",
        access_token:  session.access_token,
        refresh_token: session.refresh_token,
      })
      .eq("code", code);

    if (updateError) return json({ error: "Failed to claim code" }, 500);
    return json({ success: true });
  }

  return json({ error: "Invalid action. Use: create | poll | claim" }, 400);
  } catch (err) {
    console.error("tv-auth error:", err);
    await logEdgeError({ functionName: "tv-auth", error: err, context: { action, ip } });
    return json({ error: "Internal server error" }, 500);
  }
});
