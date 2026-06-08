import { z } from "zod";

export const HostStatusSchema = z.enum(["offline", "online", "busy"]);
export type HostStatus = z.infer<typeof HostStatusSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const RelayJwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  host_id: z.string().uuid(),
  role: z.enum(["web", "runner"]),
  exp: z.number(),
});
export type RelayJwtPayload = z.infer<typeof RelayJwtPayloadSchema>;

export const WsEnvelopeSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
  requestId: z.string().optional(),
});
export type WsEnvelope = z.infer<typeof WsEnvelopeSchema>;

export const ChatStartPayloadSchema = z.object({
  model: z.string().optional(),
  messages: z.array(ChatMessageSchema),
  contextIds: z.array(z.string()).optional(),
});
export type ChatStartPayload = z.infer<typeof ChatStartPayloadSchema>;

export const ChatDeltaPayloadSchema = z.object({
  content: z.string(),
});
export type ChatDeltaPayload = z.infer<typeof ChatDeltaPayloadSchema>;

export const ChatErrorPayloadSchema = z.object({
  message: z.string(),
});
export type ChatErrorPayload = z.infer<typeof ChatErrorPayloadSchema>;

export const HostStatusPayloadSchema = z.object({
  status: HostStatusSchema,
});
export type HostStatusPayload = z.infer<typeof HostStatusPayloadSchema>;

export const WS_MESSAGE_TYPES = {
  CHAT_START: "chat.start",
  CHAT_DELTA: "chat.delta",
  CHAT_DONE: "chat.done",
  CHAT_ERROR: "chat.error",
  CHAT_CANCEL: "chat.cancel",
  HOST_STATUS: "host.status",
  MODEL_PULL: "model.pull",
  MODEL_PULL_PROGRESS: "model.pull.progress",
  MODEL_PULL_DONE: "model.pull.done",
  MODEL_PULL_ERROR: "model.pull.error",
  CONTEXT_LIST: "context.list",
  CONTEXT_CREATE: "context.create",
  CONTEXT_CREATED: "context.created",
  CONTEXT_DELETE: "context.delete",
  CONTEXT_DELETED: "context.deleted",
  CONTEXT_STATUS: "context.status",
  CONTEXT_UPLOAD: "context.upload",
  CONTEXT_UPLOAD_PROGRESS: "context.upload.progress",
  CONTEXT_UPLOAD_DONE: "context.upload.done",
  CONTEXT_CHUNKS: "context.chunks",
  CONTEXT_ERROR: "context.error",
  PING: "ping",
  PONG: "pong",
} as const;

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description?: string;
  docCount: number;
  status: string;
}

export interface ContextLinkSummary {
  id: string;
  knowledgeBaseId: string;
  linkType: string;
  path: string;
  recursive: boolean;
  enabled: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus: string;
  lastSyncError?: string | null;
  docCount: number;
}

export interface ContextDocumentSummary {
  id: string;
  filename: string;
  status: string;
  chunkCount: number;
  errorMessage?: string | null;
  sourceType?: string;
  linkId?: string | null;
  relativePath?: string | null;
  externalPath?: string | null;
}

export interface ContextStatusPayload {
  documents: ContextDocumentSummary[];
  links: ContextLinkSummary[];
}

export interface ChunkPreview {
  id: string;
  documentId: string;
  index: number;
  preview: string;
}

export interface ModelPullProgressPayload {
  model?: string;
  message?: string;
  percent?: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
}

export function createEnvelope(
  type: string,
  payload: unknown,
  requestId?: string,
): WsEnvelope {
  return { type, payload, ...(requestId ? { requestId } : {}) };
}

export function parseEnvelope(data: string): WsEnvelope | null {
  try {
    const json = JSON.parse(data);
    const result = WsEnvelopeSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serializeEnvelope(envelope: WsEnvelope): string {
  return JSON.stringify(envelope);
}
