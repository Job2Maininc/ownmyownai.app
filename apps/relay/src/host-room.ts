export class HostRoom implements DurableObject {
  private runner: WebSocket | null = null;
  private webClients = new Set<WebSocket>();

  constructor(
    private state: DurableObjectState,
    _env: Env,
  ) {}

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
      this.broadcastToWeb(
        JSON.stringify({ type: "host.status", payload: { status: "online" } }),
      );
    } else {
      this.webClients.add(ws);
      ws.send(
        JSON.stringify({
          type: "host.status",
          payload: { status: this.runner ? "online" : "offline" },
        }),
      );
    }

    ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";
      if (role === "runner") {
        this.broadcastToWeb(data);
      } else if (this.runner && this.runner.readyState === WebSocket.OPEN) {
        this.runner.send(data);
      } else {
        ws.send(
          JSON.stringify({
            type: "chat.error",
            payload: { message: "Le host est hors ligne" },
          }),
        );
      }
    });

    ws.addEventListener("close", () => {
      if (role === "runner" && this.runner === ws) {
        this.runner = null;
        this.broadcastToWeb(
          JSON.stringify({ type: "host.status", payload: { status: "offline" } }),
        );
      } else {
        this.webClients.delete(ws);
      }
    });
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
