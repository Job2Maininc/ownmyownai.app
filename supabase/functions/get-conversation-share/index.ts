import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const body = await req.json();
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 64) {
    return jsonResponse({ error: "Token requis" }, 400);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("conversation_shares")
    .select("title, messages, expires_at, created_at")
    .eq("token", token)
    .single();

  if (error || !data) {
    return jsonResponse({ error: "Lien introuvable ou expiré" }, 404);
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: "Ce lien a expiré", expired: true }, 410);
  }

  return jsonResponse({
    title: data.title,
    messages: data.messages,
    expires_at: data.expires_at,
    created_at: data.created_at,
  });
});
