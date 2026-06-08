import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { generateShareToken } from "../_shared/crypto.ts";
import { getUserClient } from "../_shared/supabase.ts";

const DEFAULT_TTL_HOURS = 24;
const MAX_TTL_HOURS = 168;
const MAX_MESSAGES = 200;

interface ShareMessage {
  role: string;
  content: string;
}

function sanitizeMessages(raw: unknown): ShareMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const out: ShareMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const role = (item as ShareMessage).role;
    const content = (item as ShareMessage).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content });
  }
  return out.length > 0 ? out.slice(0, MAX_MESSAGES) : null;
}

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

  const body = await req.json();
  const { host_id, title, messages, ttl_hours } = body as {
    host_id?: string;
    title?: string;
    messages?: unknown;
    ttl_hours?: number;
  };

  const sanitized = sanitizeMessages(messages);
  if (!sanitized) {
    return jsonResponse({ error: "Au moins un message user/assistant requis" }, 400);
  }

  if (host_id) {
    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("id")
      .eq("id", host_id)
      .eq("user_id", user.id)
      .single();
    if (hostError || !host) {
      return jsonResponse({ error: "Host introuvable" }, 404);
    }
  }

  const ttl = typeof ttl_hours === "number"
    ? Math.min(Math.max(1, Math.floor(ttl_hours)), MAX_TTL_HOURS)
    : DEFAULT_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString();
  const token = generateShareToken();
  const shareTitle = (typeof title === "string" && title.trim())
    ? title.trim().slice(0, 120)
    : sanitized.find((m) => m.role === "user")?.content.slice(0, 60) ?? "Conversation";

  const { data, error } = await supabase
    .from("conversation_shares")
    .insert({
      user_id: user.id,
      host_id: host_id ?? null,
      token,
      title: shareTitle,
      messages: sanitized,
      expires_at: expiresAt,
    })
    .select("token, expires_at, title")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";

  return jsonResponse({
    token: data.token,
    title: data.title,
    expires_at: data.expires_at,
    share_url: `${appUrl}/share/${encodeURIComponent(data.token)}`,
  });
});
