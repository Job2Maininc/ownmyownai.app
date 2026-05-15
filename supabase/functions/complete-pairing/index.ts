import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { generateDeviceSecret, hashSecret } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const body = await req.json();
  const { code, name, platform, ollama_version, default_model } = body as {
    code?: string;
    name?: string;
    platform?: string;
    ollama_version?: string;
    default_model?: string;
  };

  if (!code) {
    return jsonResponse({ error: "code is required" }, 400);
  }

  const supabase = getServiceClient();

  const { data: pairing, error: pairingError } = await supabase
    .from("pairing_requests")
    .select("*")
    .eq("code", code.toUpperCase())
    .is("consumed_at", null)
    .single();

  if (pairingError || !pairing) {
    return jsonResponse({ error: "Invalid or expired pairing code" }, 404);
  }

  if (new Date(pairing.expires_at) < new Date()) {
    return jsonResponse({ error: "Pairing code expired" }, 410);
  }

  const { data: host, error: hostError } = await supabase
    .from("hosts")
    .insert({
      user_id: pairing.user_id,
      name: name ?? "Mon PC",
      platform: platform ?? "windows",
      ollama_version: ollama_version ?? null,
      default_model: default_model ?? "llama3.2:3b",
      status: "offline",
    })
    .select("id, user_id, name, default_model")
    .single();

  if (hostError || !host) {
    return jsonResponse({ error: hostError?.message ?? "Failed to create host" }, 500);
  }

  const deviceSecret = generateDeviceSecret();
  const deviceSecretHash = await hashSecret(deviceSecret);

  const { error: credError } = await supabase.from("host_credentials").insert({
    host_id: host.id,
    device_secret_hash: deviceSecretHash,
  });

  if (credError) {
    await supabase.from("hosts").delete().eq("id", host.id);
    return jsonResponse({ error: credError.message }, 500);
  }

  await supabase
    .from("pairing_requests")
    .update({ consumed_at: new Date().toISOString(), host_id: host.id })
    .eq("id", pairing.id);

  return jsonResponse({
    host_id: host.id,
    device_secret: deviceSecret,
    name: host.name,
    default_model: host.default_model,
  });
});
