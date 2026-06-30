import { LastRequestMetricsSchema, type LastRequestMetrics } from "@ownmyownai/protocol";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(raw: Record<string, unknown>, camel: string, snake: string): number | null {
  const value = raw[camel] ?? raw[snake];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(raw: Record<string, unknown>, camel: string, snake: string): string | null {
  const value = raw[camel] ?? raw[snake];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Parse `hosts.last_metrics` (camelCase ou snake_case depuis le heartbeat). */
export function parseHostLastMetrics(raw: unknown): LastRequestMetrics | null {
  const record = asRecord(raw);
  if (!record) return null;

  const normalized = {
    model: readString(record, "model", "model") ?? "—",
    tokensPerSecond: readNumber(record, "tokensPerSecond", "tokens_per_second"),
    latencyMs: readNumber(record, "latencyMs", "latency_ms"),
    ramUsedGb: readNumber(record, "ramUsedGb", "ram_used_gb"),
    promptTokens: readNumber(record, "promptTokens", "prompt_tokens") ?? undefined,
    completionTokens: readNumber(record, "completionTokens", "completion_tokens") ?? undefined,
    completedAt: readString(record, "completedAt", "completed_at") ?? new Date(0).toISOString(),
  };

  if (normalized.tokensPerSecond == null || normalized.latencyMs == null || normalized.ramUsedGb == null) {
    return null;
  }

  const parsed = LastRequestMetricsSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatTokensPerSecond(tps: number): string {
  return Number.isInteger(tps) ? String(tps) : tps.toFixed(1);
}
