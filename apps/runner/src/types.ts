export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  models: string[];
}

export interface StoredCredentials {
  host_id: string;
  device_secret: string;
  supabase_url?: string;
  /** Token Bearer pour la passerelle OpenAI locale (Cursor). */
  cursorApiToken?: string;
}

export interface HostDataLayout {
  dataDir: string;
  modelsDir: string;
  contextDir: string;
  creativesDir: string;
  activityDir: string;
}

export interface ModelTaskRouting {
  /** Petit modèle pour résumés / synthèses. */
  summaryModel?: string;
  /** Gros modèle pour rédaction. */
  writingModel?: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  builtin?: boolean;
}

export interface McpServerSummary {
  id: string;
  name: string;
  kind: "builtin" | "external";
  enabled: boolean;
  command?: string | null;
  args: string[];
  toolCount: number;
}

export interface McpToolDescriptor {
  serverId: string;
  serverName: string;
  name: string;
  qualifiedName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface CloudProviderToggle {
  enabled: boolean;
}

export interface CloudProvidersSettings {
  openai: CloudProviderToggle;
  anthropic: CloudProviderToggle;
}

export interface ScheduledSyncSettings {
  enabled: boolean;
  cron: string;
}

export interface LinkSyncReport {
  linkId: string;
  path: string;
  status: string;
  lastSyncAt?: string | null;
  error?: string | null;
}

export interface ScheduledSyncReport {
  startedAt: string;
  finishedAt: string;
  cron: string;
  linksTotal: number;
  linksOk: number;
  linksError: number;
  links: LinkSyncReport[];
}

/** Statut d'un fournisseur cloud (clé en keyring Host, jamais exposée au web). */
export interface CloudProviderStatus {
  id: "openai" | "anthropic";
  configured: boolean;
  enabled: boolean;
  models: string[];
}

export interface CursorIntegrationInfo {
  baseUrl: string;
  apiToken: string;
  enabled: boolean;
  port: number;
  /** Écoute LAN (`0.0.0.0`) au lieu de localhost uniquement. */
  lanEnabled: boolean;
  /** IP locale suggérée pour Cursor sur un autre poste du réseau. */
  lanIp?: string | null;
  defaultModel: string;
  settingsJson: string;
}

export interface CursorMcpPreview {
  configJson: string;
  serverPath: string | null;
  serverFound: boolean;
  dataDir: string;
  contextDbPath: string;
}

export interface CursorMcpWriteResult {
  path: string;
  merged: boolean;
  configJson: string;
}

export interface HostSettings {
  dataDir?: string;
  modelsDir: string;
  selectedModels: string[];
  defaultModel: string;
  /** Routage par intent : petit modèle résumé, gros modèle rédaction. */
  modelRouting?: ModelTaskRouting;
  /** Modèle secours si le modèle demandé est absent ou trop lent. */
  fallbackModel?: string;
  /** Mode air-gapped : relay et cloud désactivés. */
  airGapped?: boolean;
  /** Fournisseurs cloud optionnels (OpenAI, Anthropic). */
  cloudProviders?: CloudProvidersSettings;
  mcpServers?: McpServerConfig[];
  /** Proxy OpenAI local pour Cursor. */
  cursorGatewayEnabled?: boolean;
  /** Port HTTP du gateway Cursor (localhost). */
  cursorGatewayPort?: number;
  /** Écoute LAN (`0.0.0.0`) pour clients sur le réseau local. */
  cursorGatewayLan?: boolean;
  /** Plafond req/min par token Bearer sur le gateway (0 = désactivé). */
  cursorGatewayMaxReqPerMin?: number;
  /** Nombre de passages RAG injectés par question. */
  ragTopK?: number;
  /** Taille cible des extraits à l'indexation (~tokens). */
  ragChunkTokens?: number;
  /** Seuil de tokens estimés avant compaction de l'historique chat. */
  chatTokenThreshold?: number;
  /** Messages récents conservés verbatim après compaction. */
  chatRecentMessages?: number;
  /** Toasts Windows à la fin d'une indexation ou d'un agent. */
  desktopNotifications?: boolean;
  /** Resynchronisation planifiée des liens de contexte. */
  scheduledSync?: ScheduledSyncSettings;
}

export interface SetupProgress {
  phase: string;
  message: string;
  percent: number | null;
  bytesDownloaded: number | null;
  bytesTotal: number | null;
  currentModel: string | null;
  modelIndex: number | null;
  modelCount: number | null;
}

export interface QuantizationAdvice {
  quantization: "q4" | "q8";
  ollamaTag: string;
  estimatedSizeGb: number;
  estimatedRamGb: number;
  diskFreeGb: number | null;
  message: string;
  reason: string;
}

export interface LastRequestMetrics {
  model: string;
  tokensPerSecond: number;
  latencyMs: number;
  ramUsedGb: number;
  promptTokens?: number;
  completionTokens?: number;
  completedAt: string;
}

export type UpdateStatus =
  | "upToDate"
  | "ahead"
  | "updateAuto"
  | "updateManual"
  | "checkFailed";

export interface UpdateCheckResult {
  currentVersion: string;
  remoteVersion: string | null;
  updateAvailable: boolean;
  autoUpdateReady: boolean;
  status: UpdateStatus;
  message: string;
}

export interface MediaJobSnapshot {
  id: string;
  kind: "image" | "voice" | "music" | "video" | string;
  status: "queued" | "running" | string;
  progress: number;
  message?: string | null;
}

export interface HostStatusSnapshot {
  hostId: string | null;
  ollamaInstalled: boolean;
  ollamaRunning: boolean;
  models: string[];
  defaultModel: string;
  relayConnected: boolean;
  cloudSynced: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatError: string | null;
  lastRelayError: string | null;
  activeSessions: number;
  webViewers: number;
  servicesRunning: boolean;
  diskFreeGb: number | null;
  airGapped?: boolean;
  lastRequestMetrics?: LastRequestMetrics;
  queueDepth?: number;
  queuePosition?: number;
  activeMediaGenerations?: number;
  mediaJobs?: MediaJobSnapshot[];
}
