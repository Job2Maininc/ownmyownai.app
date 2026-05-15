import {
  parseEnvelope,
  serializeEnvelope,
  WS_MESSAGE_TYPES,
  type ChatMessage,
  type WsEnvelope,
} from "@ownmyownai/protocol";

export type RelayStatus = "connecting" | "connected" | "offline" | "error";

export interface RelayClientCallbacks {
  onStatus?: (status: RelayStatus) => void;
  onHostStatus?: (online: boolean) => void;
  onDelta?: (content: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export class RelayClient {
  private ws: WebSocket | null = null;
  private callbacks: RelayClientCallbacks = {};

  constructor(callbacks: RelayClientCallbacks) {
    this.callbacks = callbacks;
  }

  connect(relayUrl: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.callbacks.onStatus?.("connecting");
      const url = `${relayUrl}${relayUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      const wsUrl = url.replace(/^http/, "ws");

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.callbacks.onStatus?.("connected");
        resolve();
      };

      this.ws.onerror = () => {
        this.callbacks.onStatus?.("error");
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.callbacks.onStatus?.("offline");
      };

      this.ws.onmessage = (event) => {
        const envelope = parseEnvelope(event.data as string);
        if (!envelope) return;
        this.handleMessage(envelope);
      };
    });
  }

  private handleMessage(envelope: WsEnvelope) {
    switch (envelope.type) {
      case WS_MESSAGE_TYPES.HOST_STATUS: {
        const payload = envelope.payload as { status?: string };
        this.callbacks.onHostStatus?.(payload.status === "online" || payload.status === "busy");
        break;
      }
      case WS_MESSAGE_TYPES.CHAT_DELTA: {
        const payload = envelope.payload as { content?: string };
        if (payload.content) this.callbacks.onDelta?.(payload.content);
        break;
      }
      case WS_MESSAGE_TYPES.CHAT_DONE:
        this.callbacks.onDone?.();
        break;
      case WS_MESSAGE_TYPES.CHAT_ERROR: {
        const payload = envelope.payload as { message?: string };
        this.callbacks.onError?.(payload.message ?? "Unknown error");
        break;
      }
    }
  }

  sendChat(messages: ChatMessage[], model?: string, requestId?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.callbacks.onError?.("Not connected to relay");
      return;
    }
    const envelope = {
      type: WS_MESSAGE_TYPES.CHAT_START,
      payload: { messages, model },
      requestId,
    };
    this.ws.send(serializeEnvelope(envelope));
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
