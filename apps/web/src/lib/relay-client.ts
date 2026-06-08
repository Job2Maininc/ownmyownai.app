import {
  parseEnvelope,
  serializeEnvelope,
  WS_MESSAGE_TYPES,
  type ChatMessage,
  type ChatThreadSummary,
  type ChunkPreview,
  type ContextDocumentSummary,
  type ContextLinkSummary,
  type ContextStatusPayload,
  type HostStatus,
  type InlineEditApplyRequest,
  type InlineEditPreviewRequest,
  type InlineEditPreviewResponse,
  type KnowledgeBaseSummary,
  type RagCitation,
  type ModelPullProgressPayload,
  type ChatMentionScope,
  type ProjectOpenedPayload,
  type ProjectSummary,
  type PatchApplyRequest,
  type PatchPreviewRequest,
  type PatchPreviewResponse,
  type PlaybookSummary,
  type TerminalExecPayload,
  type TerminalOutputPayload,
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
  onThinkingDelta?: (thinking: string) => void;
  onCitations?: (citations: RagCitation[]) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  onContextMessage?: (envelope: WsEnvelope) => void;
  onModelPullMessage?: (envelope: WsEnvelope) => void;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const CHAT_IDLE_TIMEOUT_MS = 300_000;
const CHAT_FIRST_RESPONSE_TIMEOUT_MS = 90_000;
const CONTEXT_REQUEST_TIMEOUT_MS = 45_000;
const PATCH_TIMEOUT_MS = 120_000;
const INLINE_EDIT_TIMEOUT_MS = 120_000;

export class RelayClient {
  private ws: WebSocket | null = null;
  private callbacks: RelayClientCallbacks;
  private intentionalDisconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeRequestId: string | null = null;
  private chatIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private chatFirstResponseTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (env: WsEnvelope) => void;
      reject: (err: Error) => void;
      types: Set<string>;
      onProgress?: (percent: number, message: string) => void;
    }
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
      this.callbacks.onStatus?.("error");
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

  private payloadMessage(envelope: WsEnvelope, fallback: string): string {
    return (envelope.payload as { message?: string }).message ?? fallback;
  }

  private clearChatIdleTimer() {
    if (this.chatIdleTimer) {
      clearTimeout(this.chatIdleTimer);
      this.chatIdleTimer = null;
    }
  }

  private clearChatFirstResponseTimer() {
    if (this.chatFirstResponseTimer) {
      clearTimeout(this.chatFirstResponseTimer);
      this.chatFirstResponseTimer = null;
    }
  }

  private clearChatTimers() {
    this.clearChatIdleTimer();
    this.clearChatFirstResponseTimer();
  }

  private resetChatIdleTimer() {
    this.clearChatIdleTimer();
    if (!this.activeRequestId) return;
    this.chatIdleTimer = setTimeout(() => {
      this.activeRequestId = null;
      this.clearChatFirstResponseTimer();
      this.callbacks.onError?.(
        "Le modèle met trop de temps à répondre (5 min). Vérifiez qu'Ollama tourne et que le modèle est bien installé sur votre PC.",
      );
    }, CHAT_IDLE_TIMEOUT_MS);
  }

  private startChatFirstResponseTimer() {
    this.clearChatFirstResponseTimer();
    if (!this.activeRequestId) return;
    this.chatFirstResponseTimer = setTimeout(() => {
      this.activeRequestId = null;
      this.clearChatIdleTimer();
      this.callbacks.onHostStatus?.("offline");
      this.callbacks.onError?.(
        "Le host ne répond pas — vérifiez que l'app Host est ouverte sur ce PC.",
      );
    }, CHAT_FIRST_RESPONSE_TIMEOUT_MS);
  }

  private isActiveRequest(envelope: WsEnvelope): boolean {
    if (!this.activeRequestId) return false;
    if (!envelope.requestId) return false;
    return envelope.requestId === this.activeRequestId;
  }

  private resolvePending(envelope: WsEnvelope) {
    if (!envelope.requestId) return false;
    const pending = this.pendingRequests.get(envelope.requestId);
    if (!pending) return false;
    if (envelope.type === WS_MESSAGE_TYPES.CONTEXT_UPLOAD_PROGRESS) {
      const payload = envelope.payload as { percent?: number; message?: string };
      pending.onProgress?.(payload.percent ?? 0, payload.message ?? "");
      return true;
    }
    if (envelope.type === WS_MESSAGE_TYPES.TERMINAL_OUTPUT) {
      pending.resolve(envelope);
      return true;
    }
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
        this.clearChatFirstResponseTimer();
        this.resetChatIdleTimer();
        const payload = envelope.payload as { content?: string };
        if (payload.content) {
          this.callbacks.onDelta?.(payload.content);
        }
        break;
      }
      case WS_MESSAGE_TYPES.CHAT_THINKING_DELTA: {
        if (!this.isActiveRequest(envelope)) return;
        this.clearChatFirstResponseTimer();
        this.resetChatIdleTimer();
        const payload = envelope.payload as { thinking?: string };
        if (payload.thinking) {
          this.callbacks.onThinkingDelta?.(payload.thinking);
        }
        break;
      }
      case WS_MESSAGE_TYPES.CHAT_CITATIONS: {
        if (!this.isActiveRequest(envelope)) return;
        const payload = envelope.payload as { citations?: RagCitation[] };
        if (payload.citations?.length) {
          this.callbacks.onCitations?.(payload.citations);
        }
        break;
      }
      case WS_MESSAGE_TYPES.CHAT_DONE:
        if (!this.isActiveRequest(envelope)) return;
        this.activeRequestId = null;
        this.clearChatTimers();
        this.callbacks.onDone?.();
        break;
      case WS_MESSAGE_TYPES.CHAT_ERROR: {
        if (!this.isActiveRequest(envelope)) return;
        this.activeRequestId = null;
        this.clearChatTimers();
        this.callbacks.onError?.(this.payloadMessage(envelope, "Erreur inconnue"));
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
        reject(new Error("Le host ne répond pas — vérifiez que l'app Host est ouverte et à jour."));
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
    threadId?: string,
    requestId?: string,
    projectId?: string,
    mentionScope?: ChatMentionScope,
    thinkingMode?: boolean,
  ) {
    const id = this.send(
      WS_MESSAGE_TYPES.CHAT_START,
      {
        messages,
        model,
        contextIds: contextIds ?? [],
        threadId,
        projectId,
        mentionScope,
        thinkingMode,
      },
      requestId,
    );
    if (id) {
      this.activeRequestId = id;
      this.startChatFirstResponseTimer();
      this.resetChatIdleTimer();
    }
    return id;
  }

  sendCancel(requestId?: string) {
    const id = requestId ?? this.activeRequestId;
    if (!id) return;
    this.send(WS_MESSAGE_TYPES.CHAT_CANCEL, {}, id);
  }

  sendPlaybookRun(
    playbookId: string,
    options?: {
      model?: string;
      contextIds?: string[];
      linkId?: string;
      path?: string;
    },
    requestId?: string,
  ) {
    const id = this.send(
      WS_MESSAGE_TYPES.PLAYBOOK_RUN,
      {
        playbookId,
        model: options?.model,
        contextIds: options?.contextIds ?? [],
        linkId: options?.linkId,
        path: options?.path,
      },
      requestId,
    );
    if (id) {
      this.activeRequestId = id;
      this.startChatFirstResponseTimer();
      this.resetChatIdleTimer();
    }
    return id;
  }

  async listPlaybooks(): Promise<PlaybookSummary[]> {
    const requestId = this.send(WS_MESSAGE_TYPES.PLAYBOOK_LIST, {}) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.PLAYBOOK_LIST, WS_MESSAGE_TYPES.PLAYBOOK_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type !== WS_MESSAGE_TYPES.PLAYBOOK_LIST) {
      throw new Error(this.payloadMessage(env, "Impossible de charger les playbooks"));
    }
    return ((env.payload as { playbooks?: PlaybookSummary[] }).playbooks ?? []);
  }

  async listContextBases(): Promise<KnowledgeBaseSummary[]> {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_LIST, {}) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.CONTEXT_LIST, WS_MESSAGE_TYPES.CONTEXT_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type !== WS_MESSAGE_TYPES.CONTEXT_LIST) {
      throw new Error(this.payloadMessage(env, "Impossible de charger les bases de contexte"));
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

  async deleteContextDocument(documentId: string) {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_DELETE, { documentId }) ?? "";
    await this.waitFor(requestId, [WS_MESSAGE_TYPES.CONTEXT_DELETED, WS_MESSAGE_TYPES.CONTEXT_ERROR]);
  }

  async getContextStatus(knowledgeBaseId: string): Promise<ContextStatusPayload> {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_STATUS, { knowledgeBaseId }) ?? "";
    const env = await this.waitFor(requestId, [WS_MESSAGE_TYPES.CONTEXT_STATUS, WS_MESSAGE_TYPES.CONTEXT_ERROR]);
    const payload = env.payload as {
      documents?: ContextDocumentSummary[];
      links?: ContextLinkSummary[];
    };
    return {
      documents: payload.documents ?? [],
      links: payload.links ?? [],
    };
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
        onProgress,
      });
    });
  }

  async pullModel(
    model: string,
    onProgress?: (progress: ModelPullProgressPayload) => void,
  ): Promise<void> {
    const requestId = this.send(WS_MESSAGE_TYPES.MODEL_PULL, { model }) ?? "";

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Délai de téléchargement dépassé"));
      }, 600_000);

      this.pendingRequests.set(requestId, {
        resolve: (env) => {
          if (env.type === WS_MESSAGE_TYPES.MODEL_PULL_PROGRESS) {
            onProgress?.(env.payload as ModelPullProgressPayload);
            return;
          }
          clearTimeout(timer);
          this.pendingRequests.delete(requestId);
          if (env.type === WS_MESSAGE_TYPES.MODEL_PULL_DONE) {
            resolve();
          } else {
            reject(
              new Error(
                (env.payload as { message?: string }).message ?? "Échec du téléchargement",
              ),
            );
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        types: new Set([
          WS_MESSAGE_TYPES.MODEL_PULL_PROGRESS,
          WS_MESSAGE_TYPES.MODEL_PULL_DONE,
          WS_MESSAGE_TYPES.MODEL_PULL_ERROR,
        ]),
      });
    });
  }

  async execTerminal(
    payload: TerminalExecPayload,
    onOutput?: (output: TerminalOutputPayload) => void,
  ): Promise<number> {
    const requestId = this.send(WS_MESSAGE_TYPES.TERMINAL_EXEC, payload) ?? "";
    const timeoutMs = (payload.timeoutSecs ?? 120) * 1000 + 30_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Délai d'exécution de la commande dépassé"));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (env) => {
          if (env.type === WS_MESSAGE_TYPES.TERMINAL_OUTPUT) {
            onOutput?.(env.payload as TerminalOutputPayload);
            return;
          }
          clearTimeout(timer);
          this.pendingRequests.delete(requestId);
          if (env.type === WS_MESSAGE_TYPES.TERMINAL_DONE) {
            resolve((env.payload as { exitCode?: number }).exitCode ?? -1);
          } else {
            reject(
              new Error(
                (env.payload as { message?: string }).message ??
                  "Échec de l'exécution de la commande",
              ),
            );
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        types: new Set([
          WS_MESSAGE_TYPES.TERMINAL_OUTPUT,
          WS_MESSAGE_TYPES.TERMINAL_DONE,
          WS_MESSAGE_TYPES.TERMINAL_ERROR,
        ]),
      });
    });
  }

  async getContextChunks(documentId: string): Promise<ChunkPreview[]> {
    const requestId = this.send(WS_MESSAGE_TYPES.CONTEXT_CHUNKS, { documentId }) ?? "";
    const env = await this.waitFor(requestId, [
      WS_MESSAGE_TYPES.CONTEXT_CHUNKS,
      WS_MESSAGE_TYPES.CONTEXT_ERROR,
    ]);
    if (env.type === WS_MESSAGE_TYPES.CONTEXT_ERROR) {
      throw new Error((env.payload as { message?: string }).message ?? "Erreur");
    }
    return ((env.payload as { chunks?: ChunkPreview[] }).chunks ?? []);
  }

  async previewInlineEdit(
    request: InlineEditPreviewRequest,
  ): Promise<InlineEditPreviewResponse> {
    const requestId = this.send(WS_MESSAGE_TYPES.INLINE_EDIT_PREVIEW, request) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.INLINE_EDIT_PREVIEWED, WS_MESSAGE_TYPES.INLINE_EDIT_ERROR],
      INLINE_EDIT_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.INLINE_EDIT_ERROR) {
      throw new Error(this.payloadMessage(env, "Échec de la prévisualisation"));
    }
    return env.payload as InlineEditPreviewResponse;
  }

  async applyInlineEdit(request: InlineEditApplyRequest): Promise<void> {
    const requestId = this.send(WS_MESSAGE_TYPES.INLINE_EDIT_APPLY, request) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.INLINE_EDIT_APPLIED, WS_MESSAGE_TYPES.INLINE_EDIT_ERROR],
      INLINE_EDIT_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.INLINE_EDIT_ERROR) {
      throw new Error(this.payloadMessage(env, "Échec de l'application"));
    }
  }

  async previewPatch(request: PatchPreviewRequest): Promise<PatchPreviewResponse> {
    const requestId = this.send(WS_MESSAGE_TYPES.PATCH_PREVIEW, request) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.PATCH_PREVIEWED, WS_MESSAGE_TYPES.PATCH_ERROR],
      PATCH_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.PATCH_ERROR) {
      throw new Error(this.payloadMessage(env, "Échec de la prévisualisation du patch"));
    }
    return env.payload as PatchPreviewResponse;
  }

  async listProjects(): Promise<{
    projects: ProjectSummary[];
    activeProjectId?: string | null;
  }> {
    const requestId = this.send(WS_MESSAGE_TYPES.PROJECT_LIST, {}) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.PROJECT_LIST, WS_MESSAGE_TYPES.PROJECT_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.PROJECT_ERROR) {
      throw new Error(this.payloadMessage(env, "Impossible de charger les projets"));
    }
    const payload = env.payload as {
      projects?: ProjectSummary[];
      activeProjectId?: string | null;
    };
    return {
      projects: payload.projects ?? [],
      activeProjectId: payload.activeProjectId,
    };
  }

  async openProject(id: string): Promise<ProjectOpenedPayload> {
    const requestId = this.send(WS_MESSAGE_TYPES.PROJECT_OPEN, { id }) ?? "";
    const env = await this.waitFor(requestId, [
      WS_MESSAGE_TYPES.PROJECT_OPENED,
      WS_MESSAGE_TYPES.PROJECT_ERROR,
    ]);
    if (env.type === WS_MESSAGE_TYPES.PROJECT_ERROR) {
      throw new Error(this.payloadMessage(env, "Impossible d'ouvrir le projet"));
    }
    return env.payload as ProjectOpenedPayload;
  }

  async applyPatch(request: PatchApplyRequest): Promise<void> {
    const requestId = this.send(WS_MESSAGE_TYPES.PATCH_APPLY, request) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.PATCH_APPLIED, WS_MESSAGE_TYPES.PATCH_ERROR],
      PATCH_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.PATCH_ERROR) {
      throw new Error(this.payloadMessage(env, "Échec de l'application du patch"));
    }
  }

  async listChatThreads(limit = 50): Promise<ChatThreadSummary[]> {
    const requestId = this.send(WS_MESSAGE_TYPES.HISTORY_LIST, { limit }) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.HISTORY_LIST, WS_MESSAGE_TYPES.HISTORY_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.HISTORY_ERROR) {
      throw new Error(this.payloadMessage(env, "Impossible de charger l'historique"));
    }
    return ((env.payload as { threads?: ChatThreadSummary[] }).threads ?? []);
  }

  async listChatThreadBranches(rootThreadId: string): Promise<ChatThreadSummary[]> {
    const requestId =
      this.send(WS_MESSAGE_TYPES.HISTORY_BRANCHES, { rootThreadId }) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.HISTORY_BRANCHES, WS_MESSAGE_TYPES.HISTORY_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.HISTORY_ERROR) {
      throw new Error(this.payloadMessage(env, "Impossible de charger les branches"));
    }
    return ((env.payload as { threads?: ChatThreadSummary[] }).threads ?? []);
  }

  async getChatThread(threadId: string): Promise<{
    thread: {
      id: string;
      title: string;
      model?: string;
      contextIds: string[];
      createdAt: string;
      updatedAt: string;
      parentThreadId?: string | null;
      forkAtIndex?: number | null;
      rootThreadId: string;
    };
    messages: ChatMessage[];
  }> {
    const requestId = this.send(WS_MESSAGE_TYPES.HISTORY_GET, { threadId }) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.HISTORY_GET, WS_MESSAGE_TYPES.HISTORY_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.HISTORY_ERROR) {
      throw new Error(this.payloadMessage(env, "Conversation introuvable"));
    }
    const payload = env.payload as {
      thread?: {
        id: string;
        title: string;
        model?: string;
        contextIds: string[];
        createdAt: string;
        updatedAt: string;
        parentThreadId?: string | null;
        forkAtIndex?: number | null;
        rootThreadId?: string;
      };
      messages?: ChatMessage[];
    };
    return {
      thread: {
        id: threadId,
        title: "",
        contextIds: [],
        createdAt: "",
        updatedAt: "",
        rootThreadId: threadId,
        ...payload.thread,
      },
      messages: payload.messages ?? [],
    };
  }

  async saveChatThread(
    messages: ChatMessage[],
    options?: {
      threadId?: string;
      title?: string;
      model?: string;
      contextIds?: string[];
    },
  ): Promise<string> {
    const requestId = this.send(WS_MESSAGE_TYPES.HISTORY_SAVE, {
      threadId: options?.threadId,
      title: options?.title,
      model: options?.model,
      contextIds: options?.contextIds ?? [],
      messages,
    }) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.HISTORY_SAVED, WS_MESSAGE_TYPES.HISTORY_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.HISTORY_ERROR) {
      throw new Error(this.payloadMessage(env, "Échec de sauvegarde"));
    }
    return (env.payload as { threadId: string }).threadId;
  }

  async forkChatThread(
    parentThreadId: string,
    forkAtIndex: number,
    options?: { model?: string; contextIds?: string[] },
  ): Promise<string> {
    const requestId = this.send(WS_MESSAGE_TYPES.HISTORY_FORK, {
      parentThreadId,
      forkAtIndex,
      model: options?.model,
      contextIds: options?.contextIds ?? [],
    }) ?? "";
    const env = await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.HISTORY_FORKED, WS_MESSAGE_TYPES.HISTORY_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
    if (env.type === WS_MESSAGE_TYPES.HISTORY_ERROR) {
      throw new Error(this.payloadMessage(env, "Échec de création de branche"));
    }
    return (env.payload as { threadId: string }).threadId;
  }

  async deleteChatThread(threadId: string): Promise<void> {
    const requestId = this.send(WS_MESSAGE_TYPES.HISTORY_DELETE, { threadId }) ?? "";
    await this.waitFor(
      requestId,
      [WS_MESSAGE_TYPES.HISTORY_DELETED, WS_MESSAGE_TYPES.HISTORY_ERROR],
      CONTEXT_REQUEST_TIMEOUT_MS,
    );
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this.activeRequestId = null;
    this.clearChatTimers();
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
