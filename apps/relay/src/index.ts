import { HostRoom } from "./host-room";
import { verifyRelayJwt } from "./jwt";

export { HostRoom };

export interface Env {
  HOST_ROOM: DurableObjectNamespace;
  RELAY_JWT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname !== "/v1/connect") {
      return new Response("Not found", { status: 404 });
    }

    const token = url.searchParams.get("token");
    if (!token || !env.RELAY_JWT_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const claims = await verifyRelayJwt(token, env.RELAY_JWT_SECRET);
    if (!claims) {
      return new Response("Invalid token", { status: 401 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const id = env.HOST_ROOM.idFromName(claims.host_id);
    const stub = env.HOST_ROOM.get(id);

    const relayUrl = new URL(request.url);
    relayUrl.searchParams.set("role", claims.role);

    return stub.fetch(
      new Request(relayUrl.toString(), {
        headers: request.headers,
      }),
    );
  },
};
