import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { verifySecret } from "../_shared/crypto.ts";
import { signRelayJwt } from "../_shared/jwt.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const deviceSecret = req.headers.get("X-Device-Secret");
  const hostId = req.headers.get("X-Host-Id");

  if (!deviceSecret || !hostId) {
    return jsonResponse({ error: "X-Device-Secret and X-Host-Id required" }, 400);
  }

  const supabase = getServiceClient();

  const { data: host, error: hostError } = await supabase
    .from("hosts")
    .select("id, user_id")
    .eq("id", hostId)
    .single();

  if (hostError || !host) {
    return jsonResponse({ error: "Host not found" }, 404);
  }

  const { data: cred, error: credError } = await supabase
    .from("host_credentials")
    .select("device_secret_hash")
    .eq("host_id", hostId)
    .single();

  if (credError || !cred) {
    return jsonResponse({ error: "Invalid host" }, 401);
  }

  const valid = await verifySecret(deviceSecret, cred.device_secret_hash);
  if (!valid) {
    return jsonResponse({ error: "Invalid credentials" }, 401);
  }

  const secret = Deno.env.get("RELAY_JWT_SECRET");
  if (!secret) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const token = await signRelayJwt(
    { sub: host.user_id, host_id: hostId, role: "runner", exp },
    secret,
  );

  const relayUrl = Deno.env.get("RELAY_URL") ?? "ws://localhost:8787/v1/connect";

  return jsonResponse({ token, relay_url: relayUrl, expires_at: exp });
});
