import { describe, expect, it } from "vitest";
import { getHostDisplayStatus, hostStatusLabel } from "../host-status";
import type { Host } from "@ownmyownai/supabase-types";

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000002",
    name: "Test PC",
    platform: "windows",
    ollama_version: null,
    default_model: "llama3.2:3b",
    installed_models: [],
    disk_free_gb: null,
    context_summary: [],
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
});
