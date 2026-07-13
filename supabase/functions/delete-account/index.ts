// ============================================================
//  MovieKnight — Delete Account Edge Function
//  Verifies the user's JWT, wipes all their data, then removes
//  their auth record.  Must be called with the user's own Bearer
//  token (anon-key client, not service role).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCors } from "../_shared/cors-utils.ts";
import { logEdgeError } from "../_shared/error-logger.ts";

function json(data: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  const cors = makeCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  let uid: string | null = null;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401, cors);

    // ── Verify the caller's identity via anon client ──────────
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (!user || userError) return json({ error: "Unauthorized" }, 401, cors);

    uid = user.id;

    // ── Use service role for data deletion ────────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete watch history
    await admin.from("watch_history").delete().eq("user_id", uid);

    // Delete list memberships (shared lists this user is a member of)
    await admin.from("list_members").delete().eq("user_id", uid);

    // Delete lists owned by user (cascade removes list_items + list_members)
    const { data: ownedLists } = await admin
      .from("custom_lists")
      .select("id")
      .eq("owner_id", uid);

    if (ownedLists?.length) {
      const ids = ownedLists.map((l: { id: string }) => l.id);
      await admin.from("list_items").delete().in("list_id", ids);
      await admin.from("list_members").delete().in("list_id", ids);
      await admin.from("custom_lists").delete().eq("owner_id", uid);
    }

    // Delete follows
    await admin
      .from("follows")
      .delete()
      .or(`follower_id.eq.${uid},followed_id.eq.${uid}`);

    // Delete profile
    await admin.from("profiles").delete().eq("id", uid);

    // ── Delete auth user (point of no return) ─────────────────
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
    if (deleteError) {
      console.error("Auth delete failed:", deleteError);
      await logEdgeError({
        functionName: "delete-account",
        error: deleteError,
        userId: uid,
        context: { stage: "auth.admin.deleteUser", note: "user data already wiped — partial-deletion state" },
      });
      return json({ error: "Failed to delete auth record" }, 500, cors);
    }

    return json({ success: true }, 200, cors);
  } catch (err) {
    console.error("delete-account error:", err);
    await logEdgeError({ functionName: "delete-account", error: err, userId: uid });
    return json({ error: "Internal server error" }, 500, cors);
  }
});
