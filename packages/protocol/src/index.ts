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

/** Intent de tâche pour routage multi-modèle côté Host (petit modèle résumé, gros rédaction). */
export const ChatTaskIntentSchema = z.enum(["summary", "writing"]);
export type ChatTaskIntent = z.infer<typeof ChatTaskIntentSchema>;

/** Scope RAG issu des @mentions dans le composer (@base, @fichier, @dossier). */
export const ChatMentionScopeSchema = z.object({
  baseNames: z.array(z.string()).optional(),
  fileHints: z.array(z.string()).optional(),
  folderHints: z.array(z.string()).optional(),
});
export type ChatMentionScope = z.infer<typeof ChatMentionScopeSchema>;

export const ChatStartPayloadSchema = z.object({
  model: z.string().optional(),
  /** Intent explicite ; sinon le Host détecte depuis le dernier message utilisateur. */
  taskIntent: ChatTaskIntentSchema.optional(),
  messages: z.array(ChatMessageSchema),
  contextIds: z.array(z.string()).optional(),
  /** Mentions extraites côté web avant envoi (le Host re-parse aussi le dernier message). */
  mentionScope: ChatMentionScopeSchema.optional(),
  /** Projet actif — résout les bases si contextIds est vide. */
  projectId: z.string().optional(),
  threadId: z.string().optional(),
  /** Active le mode réflexion Ollama (`think: true`, streaming pensée séparé). */
  thinkingMode: z.boolean().optional(),
  /** Active les outils locaux Host (read_file, search_chunks, list_dir, stat) via tool calling Ollama. */
  enableTools: z.boolean().optional(),
});
export type ChatStartPayload = z.infer<typeof ChatStartPayloadSchema>;

/** Outils locaux exécutés côté Host dans le sandbox des sources liées. */
export const LocalToolNameSchema = z.enum([
  "read_file",
  "search_chunks",
  "list_dir",
  "stat",
]);
export type LocalToolName = z.infer<typeof LocalToolNameSchema>;

export const ChatThreadSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  model: z.string().optional(),
  messageCount: z.number(),
  updatedAt: z.string(),
  parentThreadId: z.string().nullable().optional(),
  forkAtIndex: z.number().nullable().optional(),
  rootThreadId: z.string().optional(),
});
export type ChatThreadSummary = z.infer<typeof ChatThreadSummarySchema>;

export const HistoryGetPayloadSchema = z.object({
  threadId: z.string(),
});

export const HistoryBranchesPayloadSchema = z.object({
  rootThreadId: z.string(),
});

export const HistoryForkPayloadSchema = z.object({
  parentThreadId: z.string(),
  forkAtIndex: z.number().int().min(0),
  model: z.string().optional(),
  contextIds: z.array(z.string()).optional(),
});
export type HistoryForkPayload = z.infer<typeof HistoryForkPayloadSchema>;

export const HistorySavePayloadSchema = z.object({
  threadId: z.string().optional(),
  title: z.string().optional(),
  model: z.string().optional(),
  contextIds: z.array(z.string()).optional(),
  messages: z.array(ChatMessageSchema),
});
export type HistorySavePayload = z.infer<typeof HistorySavePayloadSchema>;

/** Messages exposables via lien de partage lecture seule (pas de system / RAG). */
export const ShareMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});
export type ShareMessage = z.infer<typeof ShareMessageSchema>;

export const CreateSharePayloadSchema = z.object({
  hostId: z.string().uuid().optional(),
  title: z.string().max(120).optional(),
  messages: z.array(ShareMessageSchema).min(1).max(200),
  ttlHours: z.number().int().min(1).max(168).optional(),
});
export type CreateSharePayload = z.infer<typeof CreateSharePayloadSchema>;

export const ShareViewSchema = z.object({
  title: z.string(),
  messages: z.array(ShareMessageSchema),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type ShareView = z.infer<typeof ShareViewSchema>;

export const ChatDeltaPayloadSchema = z.object({
  content: z.string(),
});
export type ChatDeltaPayload = z.infer<typeof ChatDeltaPayloadSchema>;

export const ChatThinkingDeltaPayloadSchema = z.object({
  thinking: z.string(),
});
export type ChatThinkingDeltaPayload = z.infer<typeof ChatThinkingDeltaPayloadSchema>;

export const ChatErrorPayloadSchema = z.object({
  message: z.string(),
});
export type ChatErrorPayload = z.infer<typeof ChatErrorPayloadSchema>;

export const ChatModelFallbackPayloadSchema = z.object({
  primaryModel: z.string(),
  fallbackModel: z.string(),
  reason: z.enum(["absent", "slow"]),
});
export type ChatModelFallbackPayload = z.infer<typeof ChatModelFallbackPayloadSchema>;

export const RagCitationSchema = z.object({
  index: z.number(),
  source: z.string(),
  sourceFull: z.string(),
  excerpt: z.string(),
  score: z.number(),
  chunkId: z.string(),
  documentId: z.string(),
});
export type RagCitation = z.infer<typeof RagCitationSchema>;

export const ChatCitationsPayloadSchema = z.object({
  citations: z.array(RagCitationSchema),
});
export type ChatCitationsPayload = z.infer<typeof ChatCitationsPayloadSchema>;

export const HostStatusPayloadSchema = z.object({
  status: HostStatusSchema,
});
export type HostStatusPayload = z.infer<typeof HostStatusPayloadSchema>;

/** Dernières métriques d'inférence locale (Host → heartbeat → dashboard). */
export const LastRequestMetricsSchema = z.object({
  model: z.string(),
  tokensPerSecond: z.number(),
  latencyMs: z.number(),
  ramUsedGb: z.number(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  completedAt: z.string(),
});
export type LastRequestMetrics = z.infer<typeof LastRequestMetricsSchema>;

export const InlineEditPreviewRequestSchema = z.object({
  documentId: z.string(),
  selectedText: z.string().min(1),
  instruction: z.string().min(1),
  model: z.string().optional(),
});
export type InlineEditPreviewRequest = z.infer<typeof InlineEditPreviewRequestSchema>;

export const InlineEditPreviewResponseSchema = z.object({
  documentId: z.string(),
  filename: z.string(),
  filepath: z.string(),
  originalText: z.string(),
  selectedText: z.string(),
  proposedText: z.string(),
});
export type InlineEditPreviewResponse = z.infer<typeof InlineEditPreviewResponseSchema>;

export const InlineEditApplyRequestSchema = z.object({
  documentId: z.string(),
  selectedText: z.string().min(1),
  proposedText: z.string(),
});
export type InlineEditApplyRequest = z.infer<typeof InlineEditApplyRequestSchema>;

/** Prévisualisation / application d'un patch unified côté Host (confirmation obligatoire). */
export const PatchPreviewRequestSchema = z.object({
  path: z.string().optional(),
  patch: z.string().min(1),
  contextIds: z.array(z.string()).optional(),
});
export type PatchPreviewRequest = z.infer<typeof PatchPreviewRequestSchema>;

export const PatchPreviewResponseSchema = z.object({
  path: z.string(),
  patch: z.string(),
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
  hunks: z.number().int().nonnegative(),
});
export type PatchPreviewResponse = z.infer<typeof PatchPreviewResponseSchema>;

export const PatchApplyRequestSchema = z.object({
  path: z.string().optional(),
  patch: z.string().min(1),
  contextIds: z.array(z.string()).optional(),
});
export type PatchApplyRequest = z.infer<typeof PatchApplyRequestSchema>;

/** Exécution de commande allowlistée côté Host (terminal intégré). */
export const TerminalOutputStreamSchema = z.enum(["stdout", "stderr"]);
export type TerminalOutputStream = z.infer<typeof TerminalOutputStreamSchema>;

export const TerminalExecPayloadSchema = z.object({
  program: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional(),
  timeoutSecs: z.number().int().positive().optional(),
});
export type TerminalExecPayload = z.infer<typeof TerminalExecPayloadSchema>;

export const TerminalOutputPayloadSchema = z.object({
  stream: TerminalOutputStreamSchema,
  data: z.string(),
});
export type TerminalOutputPayload = z.infer<typeof TerminalOutputPayloadSchema>;

export const TerminalDonePayloadSchema = z.object({
  exitCode: z.number().int(),
});
export type TerminalDonePayload = z.infer<typeof TerminalDonePayloadSchema>;

export const TerminalErrorPayloadSchema = z.object({
  message: z.string(),
});
export type TerminalErrorPayload = z.infer<typeof TerminalErrorPayloadSchema>;

export const PlaybookSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requiresLink: z.boolean(),
});
export type PlaybookSummary = z.infer<typeof PlaybookSummarySchema>;

export const PlaybookRunPayloadSchema = z.object({
  playbookId: z.string().min(1),
  model: z.string().optional(),
  contextIds: z.array(z.string()).optional(),
  linkId: z.string().optional(),
  path: z.string().optional(),
});
export type PlaybookRunPayload = z.infer<typeof PlaybookRunPayloadSchema>;

export const WS_MESSAGE_TYPES = {
  CHAT_START: "chat.start",
  CHAT_DELTA: "chat.delta",
  CHAT_CITATIONS: "chat.citations",
  CHAT_THINKING_DELTA: "chat.thinking_delta",
  CHAT_DONE: "chat.done",
  CHAT_ERROR: "chat.error",
  CHAT_MODEL_FALLBACK: "chat.modelFallback",
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
  PROJECT_LIST: "project.list",
  PROJECT_CREATE: "project.create",
  PROJECT_CREATED: "project.created",
  PROJECT_OPEN: "project.open",
  PROJECT_OPENED: "project.opened",
  PROJECT_UPDATE: "project.update",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETE: "project.delete",
  PROJECT_DELETED: "project.deleted",
  PROJECT_ERROR: "project.error",
  HISTORY_LIST: "history.list",
  HISTORY_GET: "history.get",
  HISTORY_SAVE: "history.save",
  HISTORY_DELETE: "history.delete",
  HISTORY_FORK: "history.fork",
  HISTORY_BRANCHES: "history.branches",
  HISTORY_SAVED: "history.saved",
  HISTORY_FORKED: "history.forked",
  HISTORY_DELETED: "history.deleted",
  HISTORY_ERROR: "history.error",
  MEMORY_LIST: "memory.list",
  MEMORY_ADD: "memory.add",
  MEMORY_ADDED: "memory.added",
  MEMORY_DELETE: "memory.delete",
  MEMORY_DELETED: "memory.deleted",
  MEMORY_SET_ENABLED: "memory.setEnabled",
  MEMORY_UPDATED: "memory.updated",
  MEMORY_ERROR: "memory.error",
  INLINE_EDIT_PREVIEW: "inline_edit.preview",
  INLINE_EDIT_PREVIEWED: "inline_edit.previewed",
  INLINE_EDIT_APPLY: "inline_edit.apply",
  INLINE_EDIT_APPLIED: "inline_edit.applied",
  INLINE_EDIT_ERROR: "inline_edit.error",
  PATCH_PREVIEW: "patch.preview",
  PATCH_PREVIEWED: "patch.previewed",
  PATCH_APPLY: "patch.apply",
  PATCH_APPLIED: "patch.applied",
  PATCH_ERROR: "patch.error",
  TERMINAL_EXEC: "terminal.exec",
  TERMINAL_OUTPUT: "terminal.output",
  TERMINAL_DONE: "terminal.done",
  TERMINAL_ERROR: "terminal.error",
  JOB_START: "job.start",
  JOB_PROGRESS: "job.progress",
  JOB_DONE: "job.done",
  JOB_ERROR: "job.error",
  JOB_CANCEL: "job.cancel",
  JOB_CANCELLED: "job.cancelled",
  JOB_LIST: "job.list",
  JOB_STATUS: "job.status",
  PLAYBOOK_LIST: "playbook.list",
  PLAYBOOK_RUN: "playbook.run",
  PLAYBOOK_ERROR: "playbook.error",
  /** Relay → runner : nombre de clients web connectés à la room. */
  RELAY_WEB_CLIENTS: "relay.web_clients",
  PING: "ping",
  PONG: "pong",
} as const;

export const RelayWebClientsPayloadSchema = z.object({
  count: z.number().int().nonnegative(),
});
export type RelayWebClientsPayload = z.infer<typeof RelayWebClientsPayloadSchema>;

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  systemInstruction: z.string().optional(),
  knowledgeBaseIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  isActive: z.boolean().optional(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectListPayloadSchema = z.object({
  projects: z.array(ProjectSummarySchema),
  activeProjectId: z.string().nullable().optional(),
});
export type ProjectListPayload = z.infer<typeof ProjectListPayloadSchema>;

export const ProjectOpenPayloadSchema = z.object({
  id: z.string(),
});
export type ProjectOpenPayload = z.infer<typeof ProjectOpenPayloadSchema>;

export const UserMemoryFactSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserMemoryFact = z.infer<typeof UserMemoryFactSchema>;

export const UserMemoryStateSchema = z.object({
  enabled: z.boolean(),
  facts: z.array(UserMemoryFactSchema),
});
export type UserMemoryState = z.infer<typeof UserMemoryStateSchema>;

export const MemoryAddPayloadSchema = z.object({
  content: z.string().min(1).max(500),
});
export type MemoryAddPayload = z.infer<typeof MemoryAddPayloadSchema>;

export const MemoryDeletePayloadSchema = z.object({
  id: z.string(),
});
export type MemoryDeletePayload = z.infer<typeof MemoryDeletePayloadSchema>;

export const MemorySetEnabledPayloadSchema = z.object({
  enabled: z.boolean(),
});
export type MemorySetEnabledPayload = z.infer<typeof MemorySetEnabledPayloadSchema>;

export const ProjectOpenedPayloadSchema = z.object({
  project: ProjectSummarySchema,
  knowledgeBaseIds: z.array(z.string()),
});
export type ProjectOpenedPayload = z.infer<typeof ProjectOpenedPayloadSchema>;

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description?: string;
  /** Prompt système Host — lecture seule côté web. */
  systemInstruction?: string;
  docCount: number;
  status: string;
}

/** linkType `repo` = dépôt Git indexé (symboles + embeddings, .git exclu). */
export interface ContextLinkSummary {
  id: string;
  knowledgeBaseId: string;
  linkType: "file" | "folder" | "drive" | "repo" | string;
  path: string;
  recursive: boolean;
  enabled: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus: string;
  lastSyncError?: string | null;
  docCount: number;
  /** Nombre de symboles indexés (liens `repo` uniquement). */
  symbolCount?: number;
  /** Extensions indexées pour ce lien (allowlist par lien). */
  allowedExtensions?: string[];
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
  /** "image" pour .png/.jpg indexés via modèle vision ; "text" sinon. */
  mediaType?: "image" | "text";
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

export const JobKindSchema = z.enum(["context.sync", "context.syncAll", "agent.run"]);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStartPayloadSchema = z.object({
  kind: JobKindSchema,
  linkId: z.string().optional(),
  prompt: z.string().optional(),
  contextIds: z.array(z.string()).optional(),
});
export type JobStartPayload = z.infer<typeof JobStartPayloadSchema>;

export const JobProgressPayloadSchema = z.object({
  jobId: z.string(),
  kind: JobKindSchema.optional(),
  status: z.enum(["queued", "running", "done", "error", "cancelled"]),
  message: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  linkId: z.string().optional(),
});
export type JobProgressPayload = z.infer<typeof JobProgressPayloadSchema>;

export const JobDonePayloadSchema = z.object({
  jobId: z.string(),
  message: z.string().optional(),
});
export type JobDonePayload = z.infer<typeof JobDonePayloadSchema>;

export const JobCancelPayloadSchema = z.object({
  jobId: z.string(),
});
export type JobCancelPayload = z.infer<typeof JobCancelPayloadSchema>;

export interface JobSnapshot {
  id: string;
  kind: string;
  status: string;
  message: string;
  progress: number;
  linkId?: string | null;
}

export interface JobStatusPayload {
  jobs: JobSnapshot[];
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
