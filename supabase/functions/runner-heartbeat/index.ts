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
    installed_models?: string[];
    disk_free_gb?: number;
    context_summary?: Array<{
      id: string;
      name: string;
      doc_count: number;
      status: string;
    }>;
    indexing_progress?: {
      active?: boolean;
      progress?: number;
      message?: string;
      kind?: string;
    } | null;
  };
  const status = body.status === "busy" ? "busy" : "online";

  const update: {
    status: string;
    last_seen_at: string;
    default_model?: string;
    installed_models?: string[];
    disk_free_gb?: number;
    context_summary?: unknown[];
    indexing_progress?: unknown;
  } = {
    status,
    last_seen_at: new Date().toISOString(),
  };

  if (typeof body.default_model === "string" && body.default_model.trim()) {
    update.default_model = body.default_model.trim();
  }

  if (Array.isArray(body.installed_models)) {
    update.installed_models = body.installed_models
      .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      .map((m) => m.trim());
  }

  if (typeof body.disk_free_gb === "number" && Number.isFinite(body.disk_free_gb)) {
    update.disk_free_gb = body.disk_free_gb;
  }

  if (Array.isArray(body.context_summary)) {
    update.context_summary = body.context_summary.filter(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.name === "string" &&
        typeof e.doc_count === "number",
    );
  }

  if (body.indexing_progress === null) {
    update.indexing_progress = null;
  } else if (body.indexing_progress && typeof body.indexing_progress === "object") {
    const ip = body.indexing_progress;
    if (ip.active === true) {
      update.indexing_progress = {
        active: true,
        progress:
          typeof ip.progress === "number"
            ? Math.min(100, Math.max(0, Math.round(ip.progress)))
            : 0,
        message: typeof ip.message === "string" ? ip.message.slice(0, 500) : "",
        kind: typeof ip.kind === "string" ? ip.kind.slice(0, 64) : undefined,
      };
    } else {
      update.indexing_progress = null;
    }
  }

  const { error } = await supabase.from("hosts").update(update).eq("id", hostId);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, status });
});
