export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  models: string[];
}

export interface StoredCredentials {
  host_id: string;
  device_secret: string;
  supabase_url?: string;
}

export interface HostSettings {
  modelsDir: string;
  selectedModels: string[];
  defaultModel: string;
  /** Modèle secours si le modèle demandé est absent ou trop lent. */
  fallbackModel?: string;
  /** Mode air-gapped : relay et cloud désactivés. */
  airGapped?: boolean;
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
}
