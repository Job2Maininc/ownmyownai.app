export type TabSessionRole = "active" | "passive";

export interface ChatTabSnapshotMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    documentId: string;
    filename: string;
    chunkIndex: number;
    preview: string;
  }>;
}

export interface ChatTabSnapshot {
  messages: ChatTabSnapshotMessage[];
  streaming: boolean;
  model: string;
  activeContextIds: string[];
}

export interface TabSessionCallbacks {
  onRoleChange: (role: TabSessionRole) => void;
  onSnapshot?: (snapshot: ChatTabSnapshot) => void;
}

export function chatLockName(hostId: string): string {
  return `omoa-chat-lock:${hostId}`;
}

export function chatSyncChannelName(hostId: string): string {
  return `omoa-chat-sync:${hostId}`;
}

export function isWebLocksSupported(): boolean {
  return typeof navigator !== "undefined" && "locks" in navigator;
}

const PASSIVE_RETRY_MS = 2_000;

/**
 * One active chat tab per host via Web Locks; passive tabs mirror state over BroadcastChannel.
 */
export class TabSessionManager {
  private hostId: string;
  private callbacks: TabSessionCallbacks;
  private releaseLock: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private role: TabSessionRole = "active";
  private disposed = false;
  private lockTask: Promise<void> | null = null;

  constructor(hostId: string, callbacks: TabSessionCallbacks) {
    this.hostId = hostId;
    this.callbacks = callbacks;
  }

  getRole(): TabSessionRole {
    return this.role;
  }

  start(): void {
    if (!isWebLocksSupported()) {
      this.setRole("active");
      this.ensureChannel();
      return;
    }
    this.lockTask = this.tryAcquireLock();
  }

  broadcast(snapshot: ChatTabSnapshot): void {
    if (this.role !== "active") return;
    this.ensureChannel();
    this.channel?.postMessage({ type: "snapshot", payload: snapshot });
  }

  dispose(): void {
    this.disposed = true;
    this.stopPolling();
    this.releaseLock?.();
    this.releaseLock = null;
    this.channel?.close();
    this.channel = null;
  }

  private setRole(role: TabSessionRole): void {
    if (this.role === role) return;
    this.role = role;
    this.callbacks.onRoleChange(role);
    if (role === "passive") {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  private async tryAcquireLock(): Promise<void> {
    if (this.disposed) return;

    await navigator.locks.request(
      chatLockName(this.hostId),
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          this.setRole("passive");
          this.ensureChannel();
          return;
        }

        this.setRole("active");
        this.ensureChannel();

        await new Promise<void>((resolve) => {
          this.releaseLock = resolve;
        });

        if (!this.disposed) {
          this.setRole("passive");
        }
      },
    );
  }

  private ensureChannel(): void {
    if (typeof BroadcastChannel === "undefined" || this.channel) return;
    this.channel = new BroadcastChannel(chatSyncChannelName(this.hostId));
    this.channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: ChatTabSnapshot };
      if (data.type !== "snapshot" || this.role !== "passive" || !data.payload) return;
      this.callbacks.onSnapshot?.(data.payload);
    };
  }

  private startPolling(): void {
    if (this.pollTimer || this.disposed) return;
    this.pollTimer = setInterval(() => {
      if (this.role === "active" || this.disposed || this.lockTask) return;
      this.lockTask = this.tryAcquireLock().finally(() => {
        this.lockTask = null;
      });
    }, PASSIVE_RETRY_MS);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }
}
