import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { generateCode } from "../_shared/crypto.ts";
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

  const supabase = getUserClient(authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("pairing_requests")
    .insert({ user_id: user.id, code, expires_at: expiresAt })
    .select("id, code, expires_at")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";

  return jsonResponse({
    code: data.code,
    expires_at: data.expires_at,
    pairing_url: `${appUrl}/host/link?code=${encodeURIComponent(data.code)}`,
  });
});
