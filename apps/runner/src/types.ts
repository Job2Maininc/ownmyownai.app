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
}
