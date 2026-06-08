import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TabSessionManager,
  chatLockName,
  chatSyncChannelName,
  type ChatTabSnapshot,
} from "../tab-session";

describe("tab-session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dérive des noms de lock et canal stables par host", () => {
    const hostId = "00000000-0000-0000-0000-000000000001";
    expect(chatLockName(hostId)).toBe(`omoa-chat-lock:${hostId}`);
    expect(chatSyncChannelName(hostId)).toBe(`omoa-chat-sync:${hostId}`);
  });

  it("reste actif si Web Locks indisponible", () => {
    const manager = new TabSessionManager("host-a", { onRoleChange: vi.fn() });
    manager.start();
    expect(manager.getRole()).toBe("active");
    manager.dispose();
  });

  it("passe en passif quand le lock est indisponible", async () => {
    const onRoleChange = vi.fn();

    vi.stubGlobal("navigator", {
      locks: {
        request: vi.fn(
          async (
            _name: string,
            _options: { mode: string; ifAvailable: boolean },
            callback: (lock: unknown) => Promise<void>,
          ) => {
            await callback(null);
          },
        ),
      },
    });

    const manager = new TabSessionManager("host-b", { onRoleChange });
    manager.start();
    await Promise.resolve();

    expect(onRoleChange).toHaveBeenCalledWith("passive");
    expect(manager.getRole()).toBe("passive");
    manager.dispose();
  });

  it("diffuse les snapshots uniquement en onglet actif", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("BroadcastChannel", class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = postMessage;
      close() {}
    });

    const onRoleChange = vi.fn();
    const manager = new TabSessionManager("host-c", { onRoleChange });
    manager.start();

    const snapshot: ChatTabSnapshot = {
      messages: [{ role: "user", content: "Salut" }],
      streaming: false,
      model: "llama3.2:3b",
      activeContextIds: [],
    };

    manager.broadcast(snapshot);
    expect(postMessage).toHaveBeenCalledWith({ type: "snapshot", payload: snapshot });
    manager.dispose();
  });
});
