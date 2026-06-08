import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { verifySecret } from "../_shared/crypto.ts";
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

  const body = await req.json().catch(() => ({})) as {
    status?: string;
    default_model?: string;
  };
  const status = body.status === "busy" ? "busy" : "online";

  const update: { status: string; last_seen_at: string; default_model?: string } = {
    status,
    last_seen_at: new Date().toISOString(),
  };

  if (typeof body.default_model === "string" && body.default_model.trim()) {
    update.default_model = body.default_model.trim();
  }

  const { error } = await supabase.from("hosts").update(update).eq("id", hostId);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, status });
});
