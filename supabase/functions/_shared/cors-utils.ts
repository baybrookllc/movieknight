// Shared CORS utilities for all MovieKnight edge functions.
// Import: import { makeCors, corsHeaders } from "../_shared/cors-utils.ts";

export const ALLOWED_ORIGINS = new Set([
  "https://movieknight.ca",
  "https://www.movieknight.ca",
  "https://cinestream-app.vercel.app",
  "http://localhost:3000",
  "http://localhost:8080",
]);

export const DEFAULT_ORIGIN = "https://movieknight.ca";

export function makeCors(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(o) ? o : null;
  if (!allowed) {
    return {
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin",
    };
  }
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function corsPreflightResponse(req: Request): Response {
  return new Response("ok", { headers: makeCors(req) });
}
