// Shared CORS helper — restrict to known origins
const ALLOWED_ORIGINS = [
  "https://movieknight.ca",
  "https://www.movieknight.ca",
  "https://cinestream-app.vercel.app",
  "http://localhost:3000",
  "http://localhost:8080",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function corsResponse(req: Request, body: BodyInit | null, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: { ...corsHeaders(req), ...(init.headers ?? {}) },
  });
}
