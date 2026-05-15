import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { signRelayJwt } from "../_shared/jwt.ts";
import { getUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = await req.json();
  const { host_id } = body as { host_id?: string };
  if (!host_id) {
    return jsonResponse({ error: "host_id is required" }, 400);
  }

  const supabase = getUserClient(authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: host, error: hostError } = await supabase
    .from("hosts")
    .select("id, user_id")
    .eq("id", host_id)
    .single();

  if (hostError || !host || host.user_id !== user.id) {
    return jsonResponse({ error: "Host not found" }, 404);
  }

  const secret = Deno.env.get("RELAY_JWT_SECRET");
  if (!secret) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const exp = Math.floor(Date.now() / 1000) + 5 * 60;
  const token = await signRelayJwt(
    { sub: user.id, host_id, role: "web", exp },
    secret,
  );

  const relayUrl = Deno.env.get("RELAY_URL") ?? "ws://localhost:8787/v1/connect";

  return jsonResponse({ token, relay_url: relayUrl, expires_at: exp });
});
