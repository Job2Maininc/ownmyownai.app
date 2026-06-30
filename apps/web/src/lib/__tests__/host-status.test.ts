import { describe, expect, it } from "vitest";
import {
  getHostDisplayStatus,
  hostStatusLabel,
  hostStatusPillVariant,
  resolveChatHostStatus,
} from "../host-status";
import type { Host } from "@ownmyownai/supabase-types";

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000002",
    name: "Test PC",
    platform: "windows",
    ollama_version: null,
    default_model: "qwen2.5:7b",
    installed_models: [],
    disk_free_gb: null,
    context_summary: [],
    indexing_progress: null,
    status: "online",
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("host-status", () => {
  it("affiche hors ligne si status offline", () => {
    const host = makeHost({
      status: "offline",
      last_seen_at: new Date().toISOString(),
    });
    expect(getHostDisplayStatus(host)).toBe("offline");
  });

  it("affiche hors ligne si status online mais heartbeat expiré", () => {
    const host = makeHost({
      status: "online",
      last_seen_at: new Date(Date.now() - 120_000).toISOString(),
    });
    expect(getHostDisplayStatus(host)).toBe("offline");
  });

  it("reste en ligne si heartbeat récent", () => {
    const host = makeHost({
      status: "online",
      last_seen_at: new Date().toISOString(),
    });
    expect(getHostDisplayStatus(host)).toBe("online");
  });

  it("traduit busy en Occupé", () => {
    expect(hostStatusLabel("busy")).toBe("Occupé");
  });

  it("mappe les statuts vers les variantes StatusPill", () => {
    expect(hostStatusPillVariant("online")).toBe("online");
    expect(hostStatusPillVariant("busy")).toBe("warn");
    expect(hostStatusPillVariant("offline")).toBe("offline");
  });

  it("chat hors ligne si heartbeat expiré même si relay dit online", () => {
    const status = resolveChatHostStatus({
      relayConnected: true,
      relayHostStatus: "online",
      cloudHost: {
        status: "online",
        last_seen_at: new Date(Date.now() - 120_000).toISOString(),
      },
    });
    expect(status).toBe("offline");
  });

  it("chat en ligne si heartbeat récent et relay connecté", () => {
    const status = resolveChatHostStatus({
      relayConnected: true,
      relayHostStatus: "online",
      cloudHost: {
        status: "online",
        last_seen_at: new Date().toISOString(),
      },
    });
    expect(status).toBe("online");
  });

  it("chat hors ligne si relay signale offline", () => {
    const status = resolveChatHostStatus({
      relayConnected: true,
      relayHostStatus: "offline",
      cloudHost: {
        status: "online",
        last_seen_at: new Date().toISOString(),
      },
    });
    expect(status).toBe("offline");
  });
});
