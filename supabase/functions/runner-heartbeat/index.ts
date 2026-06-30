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
    last_metrics?: {
      model?: string;
      tokensPerSecond?: number;
      tokens_per_second?: number;
      latencyMs?: number;
      latency_ms?: number;
      ramUsedGb?: number;
      ram_used_gb?: number;
      promptTokens?: number;
      prompt_tokens?: number;
      completionTokens?: number;
      completion_tokens?: number;
      completedAt?: string;
      completed_at?: string;
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
    last_metrics?: Record<string, unknown> | null;
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

  if (body.last_metrics === null) {
    update.last_metrics = null;
  } else if (body.last_metrics && typeof body.last_metrics === "object") {
    const lm = body.last_metrics;
    const model = typeof lm.model === "string" ? lm.model.trim().slice(0, 200) : "";
    const tokensPerSecond =
      typeof lm.tokensPerSecond === "number"
        ? lm.tokensPerSecond
        : typeof lm.tokens_per_second === "number"
          ? lm.tokens_per_second
          : null;
    const latencyMs =
      typeof lm.latencyMs === "number"
        ? lm.latencyMs
        : typeof lm.latency_ms === "number"
          ? lm.latency_ms
          : null;
    const ramUsedGb =
      typeof lm.ramUsedGb === "number"
        ? lm.ramUsedGb
        : typeof lm.ram_used_gb === "number"
          ? lm.ram_used_gb
          : null;
    const completedAt =
      typeof lm.completedAt === "string"
        ? lm.completedAt
        : typeof lm.completed_at === "string"
          ? lm.completed_at
          : new Date().toISOString();

    if (
      model &&
      tokensPerSecond != null &&
      Number.isFinite(tokensPerSecond) &&
      latencyMs != null &&
      Number.isFinite(latencyMs) &&
      ramUsedGb != null &&
      Number.isFinite(ramUsedGb)
    ) {
      const normalized: Record<string, unknown> = {
        model,
        tokensPerSecond,
        latencyMs,
        ramUsedGb,
        completedAt,
      };
      const promptTokens =
        typeof lm.promptTokens === "number"
          ? lm.promptTokens
          : typeof lm.prompt_tokens === "number"
            ? lm.prompt_tokens
            : undefined;
      const completionTokens =
        typeof lm.completionTokens === "number"
          ? lm.completionTokens
          : typeof lm.completion_tokens === "number"
            ? lm.completion_tokens
            : undefined;
      if (promptTokens != null && Number.isFinite(promptTokens)) {
        normalized.promptTokens = promptTokens;
      }
      if (completionTokens != null && Number.isFinite(completionTokens)) {
        normalized.completionTokens = completionTokens;
      }
      update.last_metrics = normalized;
    }
  }

  const { error } = await supabase.from("hosts").update(update).eq("id", hostId);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, status });
});
