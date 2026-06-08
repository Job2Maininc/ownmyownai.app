import {
  parseEnvelope,
  serializeEnvelope,
  WS_MESSAGE_TYPES,
  type ChatMessage,
  type ContextDocumentSummary,
  type HostStatus,
  type KnowledgeBaseSummary,
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
  onContextMessage?: (envelope: WsEnvelope) => void;
  onModelPullMessage?: (envelope: WsEnvelope) => void;
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
  private pendingRequests = new Map<
    string,
    { resolve: (env: WsEnvelope) => void; reject: (err: Error) => void; types: Set<string> }
  >();

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
          reject(new Error("Échec de connexion WebSocket"));
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

  private resolvePending(envelope: WsEnvelope) {
    if (!envelope.requestId) return false;
    const pending = this.pendingRequests.get(envelope.requestId);
    if (!pending) return false;
    if (pending.types.has(envelope.type) || envelope.type.includes("error")) {
      this.pendingRequests.delete(envelope.requestId);
      pending.resolve(envelope);
      return true;
    }
    return false;
  }

  private handleMessage(envelope: WsEnvelope) {
    if (this.resolvePending(envelope)) return;

    if (envelope.type.startsWith("context.")) {
      this.callbacks.onContextMessage?.(envelope);
      return;
    }
    if (envelope.type.startsWith("model.pull")) {
      this.callbacks.onModelPullMessage?.(envelope);
      return;
    }

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
        this.callbacks.onError?.(payload.message ?? "Erreur inconnue");
        break;
      }
    }
  }

  private send(type: string, payload: unknown, requestId?: string): string | undefined {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.callbacks.onError?.("Non connecté au relais");
      return;
    }
    const id = requestId ?? crypto.randomUUID();
    this.ws.send(serializeEnvelope({ type, payload, requestId: id }));
    return id;
  }

  private waitFor(
    requestId: string,
    types: string[],
    timeoutMs = 120_000,
  ): Promise<WsEnvelope> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Délai dépassé"));
      }, timeoutMs);
      this.pendingRequests.set(requestId, {
        resolve: (env) => {
          clearTimeout(timer);
          resolve(env);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        types: new Set(types),
      });
    });
  }

  sendChat(
    messages: ChatMessage[],
    model?: string,
    contextIds?: string[],
    requestId?: string,
  ) {
    const id = this.send(
      WS_MESSAGE_TYPES.CHAT_START,
      { messages, model, contextIds: contextIds ?? [] },
      requestId,
    );
    if (id) this.activeRequestId = id;
    return id;
  }

  sendCancel(requestId?: string) {
    const id = requestId ?? this.activeRequestId;
    if (!id) return;
    this.send(WS_MESSAGE_TYPES.CHAT_CANCEL, {}, id);
  }

  async listContextBases(): Promise<KnowledgeBaseSummary[]> {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_LIST, {}) ?? "";
    const env = await this.waitFor(requestId, [WS_MESSAGE_TYPES.CONTEXT_LIST, WS_MESSAGE_TYPES.CONTEXT_ERROR]);
    if (env.type === WS_MESSAGE_TYPES.CONTEXT_ERROR) {
      throw new Error((env.payload as { message?: string }).message ?? "Erreur");
    }
    return ((env.payload as { bases?: KnowledgeBaseSummary[] }).bases ?? []);
  }

  async createContextBase(name: string, description = ""): Promise<KnowledgeBaseSummary> {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_CREATE, { name, description }) ?? "";
    const env = await this.waitFor(requestId, [WS_MESSAGE_TYPES.CONTEXT_CREATED, WS_MESSAGE_TYPES.CONTEXT_ERROR]);
    if (env.type === WS_MESSAGE_TYPES.CONTEXT_ERROR) {
      throw new Error((env.payload as { message?: string }).message ?? "Erreur");
    }
    return (env.payload as { base: KnowledgeBaseSummary }).base;
  }

  async deleteContextBase(id: string) {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_DELETE, { id }) ?? "";
    await this.waitFor(requestId, [WS_MESSAGE_TYPES.CONTEXT_DELETED, WS_MESSAGE_TYPES.CONTEXT_ERROR]);
  }

  async getContextStatus(knowledgeBaseId: string): Promise<ContextDocumentSummary[]> {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_STATUS, { knowledgeBaseId }) ?? "";
    const env = await this.waitFor(requestId, [WS_MESSAGE_TYPES.CONTEXT_STATUS, WS_MESSAGE_TYPES.CONTEXT_ERROR]);
    return ((env.payload as { documents?: ContextDocumentSummary[] }).documents ?? []);
  }

  async uploadContextDocument(
    knowledgeBaseId: string,
    filename: string,
    data: ArrayBuffer,
    onProgress?: (percent: number, message: string) => void,
  ): Promise<string> {
    const b64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_UPLOAD, {
      knowledgeBaseId,
      filename,
      data: b64,
    }) ?? "";

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Délai upload dépassé")), 300_000);
      this.pendingRequests.set(requestId, {
        resolve: (env) => {
          clearTimeout(timer);
          if (env.type === WS_MESSAGE_TYPES.CONTEXT_UPLOAD_DONE) {
            resolve((env.payload as { documentId: string }).documentId);
          } else if (env.type === WS_MESSAGE_TYPES.CONTEXT_ERROR) {
            reject(new Error((env.payload as { message?: string }).message ?? "Erreur"));
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        types: new Set([
          WS_MESSAGE_TYPES.CONTEXT_UPLOAD_DONE,
          WS_MESSAGE_TYPES.CONTEXT_ERROR,
        ]),
      });
    });
  }

  async pullModel(model: string): Promise<void> {
    const requestId = this.send(WS_MESSAGE_TYPES.MODEL_PULL, { model }) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.MODEL_PULL_DONE, WS_MESSAGE_TYPES.MODEL_PULL_ERROR],
      600_000,
    );
    if (env.type === WS_MESSAGE_TYPES.MODEL_PULL_ERROR) {
      throw new Error((env.payload as { message?: string }).message ?? "Échec du téléchargement");
    }
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this.activeRequestId = null;
    this.pendingRequests.clear();
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
