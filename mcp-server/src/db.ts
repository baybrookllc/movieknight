import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Configuration ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("[movieknight-mcp] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  process.exit(1);
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Shared query helpers (used by handlers/telemetry.ts) ───────────────────────

export async function queryRecent<T extends Record<string, unknown>>(opts: {
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

export function bucketBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, number> {
  return rows.reduce((acc: Record<string, number>, r) => {
    const k = String(r[key] ?? "unknown");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}
