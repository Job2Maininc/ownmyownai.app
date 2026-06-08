const RUNNER_STALE_MS = 45_000;
const LIVENESS_CHECK_MS = 20_000;
const WEB_CLIENT_CHECK_MS = 30_000;
const RUNNER_LAST_SEEN_KEY = "runnerLastSeen";

type WsRole = "web" | "runner";

interface WsAttachment {
  role: WsRole;
}

export class HostRoom implements DurableObject {
  constructor(
    private state: DurableObjectState,
    _env: Env,
  ) {}

  async alarm(): Promise<void> {
    await this.checkRunnerLiveness();
    const webCount = this.aliveWebClientCount();
    if (webCount > 0) {
      await this.state.storage.setAlarm(Date.now() + WEB_CLIENT_CHECK_MS);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = (url.searchParams.get("role") ?? "web") as WsRole;

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const existingRunner = role === "runner" ? this.getRunnerSocket() : null;

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ role } satisfies WsAttachment);

    if (role === "runner") {
      if (existingRunner) {
        try {
          existingRunner.close(1000, "replaced");
        } catch {
          /* ignore */
        }
      }
      await this.touchRunner();
      this.broadcastToWeb(
        JSON.stringify({ type: "host.status", payload: { status: "online" } }),
      );
      this.notifyRunnerWebClients();
    } else {
      server.send(
        JSON.stringify({
          type: "host.status",
          payload: { status: (await this.isRunnerAlive()) ? "online" : "offline" },
        }),
      );
      this.notifyRunnerWebClients();
      if (this.aliveWebClientCount() > 0) {
        await this.state.storage.setAlarm(Date.now() + WEB_CLIENT_CHECK_MS);
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment) return;

    const data =
      typeof message === "string" ? message : new TextDecoder().decode(message);

    if (attachment.role === "runner") {
      await this.touchRunner();
      this.broadcastToWeb(data);
      return;
    }

    const runner = this.getRunnerSocket();
    if (runner && (await this.isRunnerAlive())) {
      runner.send(data);
      return;
    }

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

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (attachment?.role === "runner") {
      await this.state.storage.delete(RUNNER_LAST_SEEN_KEY);
      this.broadcastToWeb(
        JSON.stringify({ type: "host.status", payload: { status: "offline" } }),
      );
    } else {
      this.notifyRunnerWebClients();
    }
    try {
      ws.close(code, reason);
    } catch {
      /* ignore */
    }
  }

  private getRunnerSocket(): WebSocket | null {
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WsAttachment | null;
      if (attachment?.role === "runner" && ws.readyState === WebSocket.OPEN) {
        return ws;
      }
    }
    return null;
  }

  private getWebClientSockets(): WebSocket[] {
    const clients: WebSocket[] = [];
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WsAttachment | null;
      if (attachment?.role === "web" && ws.readyState === WebSocket.OPEN) {
        clients.push(ws);
      }
    }
    return clients;
  }

  private aliveWebClientCount(): number {
    return this.getWebClientSockets().length;
  }

  private async touchRunner(): Promise<void> {
    await this.state.storage.put(RUNNER_LAST_SEEN_KEY, Date.now());
    await this.scheduleLivenessCheck();
  }

  private async getRunnerLastSeen(): Promise<number> {
    return (await this.state.storage.get<number>(RUNNER_LAST_SEEN_KEY)) ?? 0;
  }

  private async scheduleLivenessCheck(): Promise<void> {
    if (!this.getRunnerSocket()) return;
    await this.state.storage.setAlarm(Date.now() + LIVENESS_CHECK_MS);
  }

  private async checkRunnerLiveness(): Promise<void> {
    const runner = this.getRunnerSocket();
    if (!runner) return;
    if (!(await this.isRunnerAlive())) {
      await this.dropRunner(runner);
      return;
    }
    await this.scheduleLivenessCheck();
  }

  private async isRunnerAlive(): Promise<boolean> {
    const runner = this.getRunnerSocket();
    if (!runner || runner.readyState !== WebSocket.OPEN) return false;
    const lastSeen = await this.getRunnerLastSeen();
    return lastSeen > 0 && Date.now() - lastSeen < RUNNER_STALE_MS;
  }

  private async dropRunner(runner: WebSocket): Promise<void> {
    try {
      runner.close(1000, "stale");
    } catch {
      /* ignore */
    }
    await this.state.storage.delete(RUNNER_LAST_SEEN_KEY);
    this.broadcastToWeb(
      JSON.stringify({ type: "host.status", payload: { status: "offline" } }),
    );
  }

  private notifyRunnerWebClients(): void {
    const runner = this.getRunnerSocket();
    const count = this.aliveWebClientCount();
    if (!runner || runner.readyState !== WebSocket.OPEN) return;
    runner.send(
      JSON.stringify({
        type: "relay.web_clients",
        payload: { count },
      }),
    );
  }

  private broadcastToWeb(data: string): void {
    for (const client of this.getWebClientSockets()) {
      client.send(data);
    }
  }
}

interface Env {
  RELAY_JWT_SECRET: string;
}
