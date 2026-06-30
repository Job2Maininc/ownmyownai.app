import { describe, expect, it } from "vitest";
import {
  formatLatency,
  formatTokensPerSecond,
  parseHostLastMetrics,
} from "../host-metrics";

describe("parseHostLastMetrics", () => {
  it("parse le JSON camelCase du heartbeat", () => {
    const metrics = parseHostLastMetrics({
      model: "llama3.2",
      tokensPerSecond: 42.5,
      latencyMs: 850,
      ramUsedGb: 6.2,
      completedAt: "2026-06-30T12:00:00.000Z",
    });
    expect(metrics).toMatchObject({
      model: "llama3.2",
      tokensPerSecond: 42.5,
      latencyMs: 850,
    });
  });

  it("accepte le snake_case legacy du runner", () => {
    const metrics = parseHostLastMetrics({
      model: "qwen2.5",
      tokens_per_second: 18,
      latency_ms: 1200,
      ram_used_gb: 4,
      completed_at: "2026-06-30T12:00:00.000Z",
    });
    expect(metrics).toMatchObject({
      tokensPerSecond: 18,
      latencyMs: 1200,
    });
  });

  it("retourne null si champs requis absents", () => {
    expect(parseHostLastMetrics(null)).toBeNull();
    expect(parseHostLastMetrics({ model: "x" })).toBeNull();
  });
});

describe("formatLatency", () => {
  it("affiche ms sous 1 s", () => {
    expect(formatLatency(250)).toBe("250 ms");
  });

  it("affiche secondes au-delà de 1 s", () => {
    expect(formatLatency(1500)).toBe("1.5 s");
  });
});

describe("formatTokensPerSecond", () => {
  it("formate les décimales", () => {
    expect(formatTokensPerSecond(42.5)).toBe("42.5");
    expect(formatTokensPerSecond(40)).toBe("40");
  });
});
