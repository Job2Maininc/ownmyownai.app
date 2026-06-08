const RUNNER_STALE_MS = 45_000;
const LIVENESS_CHECK_MS = 20_000;

export class HostRoom implements DurableObject {
  private runner: WebSocket | null = null;
  private webClients = new Set<WebSocket>();
  private runnerLastSeen = 0;

  constructor(
    private state: DurableObjectState,
    _env: Env,
  ) {}

  async alarm(): Promise<void> {
    this.checkRunnerLiveness();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = (url.searchParams.get("role") ?? "web") as "web" | "runner";

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    this.handleConnection(server, role);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleConnection(ws: WebSocket, role: "web" | "runner") {
    if (role === "runner") {
      if (this.runner) {
        try {
          this.runner.close(1000, "replaced");
        } catch {
          /* ignore */
        }
      }
      this.runner = ws;
      this.touchRunner();
      this.broadcastToWeb(
        JSON.stringify({ type: "host.status", payload: { status: "online" } }),
      );
      this.notifyRunnerWebClients();
    } else {
      this.webClients.add(ws);
      ws.send(
        JSON.stringify({
          type: "host.status",
          payload: { status: this.isRunnerAlive() ? "online" : "offline" },
        }),
      );
      this.notifyRunnerWebClients();
    }

    ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";
      if (role === "runner") {
        this.touchRunner();
        this.broadcastToWeb(data);
      } else if (this.isRunnerAlive()) {
        this.runner!.send(data);
      } else {
        let requestId: string | undefined;
        try {
          const parsed = JSON.parse(data) as { requestId?: string };
          requestId = parsed.requestId;
        } catch {
          /* ignore */
        }
        ws.send(
          JSON.stringify({
            type: "chat.error",
            requestId,
            payload: { message: "Le host est hors ligne — ouvrez l'app Host sur ce PC." },
          }),
        );
      }
    });

    ws.addEventListener("close", () => {
      if (role === "runner" && this.runner === ws) {
        this.dropRunner();
      } else {
        this.webClients.delete(ws);
        this.notifyRunnerWebClients();
      }
    });
  }

  private touchRunner() {
    this.runnerLastSeen = Date.now();
    this.scheduleLivenessCheck();
  }

  private scheduleLivenessCheck() {
    if (!this.runner) return;
    void this.state.storage.setAlarm(Date.now() + LIVENESS_CHECK_MS);
  }

  private checkRunnerLiveness() {
    if (!this.runner) return;
    if (!this.isRunnerAlive()) {
      this.dropRunner();
      return;
    }
    this.scheduleLivenessCheck();
  }

  private isRunnerAlive(): boolean {
    return (
      this.runner !== null &&
      this.runner.readyState === WebSocket.OPEN &&
      this.runnerLastSeen > 0 &&
      Date.now() - this.runnerLastSeen < RUNNER_STALE_MS
    );
  }

  private dropRunner() {
    if (this.runner) {
      try {
        this.runner.close(1000, "stale");
      } catch {
        /* ignore */
      }
      this.runner = null;
    }
    this.runnerLastSeen = 0;
    this.broadcastToWeb(
      JSON.stringify({ type: "host.status", payload: { status: "offline" } }),
    );
  }

  private notifyRunnerWebClients() {
    if (!this.isRunnerAlive()) return;
    this.runner!.send(
      JSON.stringify({
        type: "relay.web_clients",
        payload: { count: this.webClients.size },
      }),
    );
  }

  private broadcastToWeb(data: string) {
    for (const client of this.webClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }
}

interface Env {
  RELAY_JWT_SECRET: string;
}
