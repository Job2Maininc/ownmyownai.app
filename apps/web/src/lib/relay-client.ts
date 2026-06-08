import {
  parseEnvelope,
  serializeEnvelope,
  WS_MESSAGE_TYPES,
  type ChatMessage,
  type HostStatus,
  type WsEnvelope,
} from "@ownmyownai/protocol";

export type RelayStatus = "connecting" | "connected" | "offline" | "error";

export interface RelayToken {
  token: string;
  relay_url: string;
}

export interface RelayClientCallbacks {
  mintToken: () => Promise<RelayToken>;
  onStatus?: (status: RelayStatus) => void;
  onHostStatus?: (status: HostStatus) => void;
  onDelta?: (content: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export class RelayClient {
  private ws: WebSocket | null = null;
  private callbacks: RelayClientCallbacks;
  private intentionalDisconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeRequestId: string | null = null;

  constructor(callbacks: RelayClientCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;
    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    if (this.intentionalDisconnect) return;

    this.callbacks.onStatus?.("connecting");
    try {
      const { token, relay_url } = await this.callbacks.mintToken();
      await this.openWebSocket(relay_url, token);
      this.reconnectAttempt = 0;
      this.callbacks.onStatus?.("connected");
    } catch {
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private openWebSocket(relayUrl: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.close();
        this.ws = null;
      }

      const url = `${relayUrl}${relayUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      const wsUrl = url.replace(/^http/, "ws");
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      let opened = false;

      ws.onopen = () => {
        opened = true;
        resolve();
      };

      ws.onerror = () => {
        if (!opened) {
          this.callbacks.onStatus?.("error");
          reject(new Error("WebSocket connection failed"));
        }
      };

      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
        }
        this.callbacks.onStatus?.("offline");
        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      };

      ws.onmessage = (event) => {
        const envelope = parseEnvelope(event.data as string);
        if (!envelope) return;
        this.handleMessage(envelope);
      };
    });
  }

  private scheduleReconnect() {
    if (this.intentionalDisconnect || this.reconnectTimer) return;

    const delay = Math.min(
      BASE_BACKOFF_MS * 2 ** this.reconnectAttempt,
      MAX_BACKOFF_MS,
    );
    this.reconnectAttempt += 1;
    this.callbacks.onStatus?.("connecting");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.doConnect();
    }, delay);
  }

  private isActiveRequest(envelope: WsEnvelope): boolean {
    if (!envelope.requestId || !this.activeRequestId) return true;
    return envelope.requestId === this.activeRequestId;
  }

  private handleMessage(envelope: WsEnvelope) {
    switch (envelope.type) {
      case WS_MESSAGE_TYPES.HOST_STATUS: {
        const payload = envelope.payload as { status?: HostStatus };
        if (
          payload.status === "online" ||
          payload.status === "busy" ||
          payload.status === "offline"
        ) {
          this.callbacks.onHostStatus?.(payload.status);
        }
        break;
      }
      case WS_MESSAGE_TYPES.CHAT_DELTA: {
        if (!this.isActiveRequest(envelope)) return;
        const payload = envelope.payload as { content?: string };
        if (payload.content) this.callbacks.onDelta?.(payload.content);
        break;
      }
      case WS_MESSAGE_TYPES.CHAT_DONE:
        if (!this.isActiveRequest(envelope)) return;
        this.activeRequestId = null;
        this.callbacks.onDone?.();
        break;
      case WS_MESSAGE_TYPES.CHAT_ERROR: {
        if (!this.isActiveRequest(envelope)) return;
        this.activeRequestId = null;
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
    const id = requestId ?? crypto.randomUUID();
    this.activeRequestId = id;
    const envelope = {
      type: WS_MESSAGE_TYPES.CHAT_START,
      payload: { messages, model },
      requestId: id,
    };
    this.ws.send(serializeEnvelope(envelope));
    return id;
  }

  sendCancel(requestId?: string) {
    const id = requestId ?? this.activeRequestId;
    if (!id || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const envelope = {
      type: WS_MESSAGE_TYPES.CHAT_CANCEL,
      payload: {},
      requestId: id,
    };
    this.ws.send(serializeEnvelope(envelope));
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this.activeRequestId = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
