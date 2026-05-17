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
  servicesRunning: boolean;
}
