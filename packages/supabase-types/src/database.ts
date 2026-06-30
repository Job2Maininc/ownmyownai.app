export type HostStatus = "offline" | "online" | "busy";

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
}

export interface ContextSummaryEntry {
  id: string;
  name: string;
  doc_count: number;
  linked_doc_count?: number;
  status: "ready" | "indexing" | "error";
  sync_status?: string;
}

export interface HostIndexingProgress {
  active: boolean;
  progress: number;
  message: string;
  kind?: string;
}

/** Dernières métriques d'inférence (heartbeat Supabase → dashboard). */
export interface HostLastMetrics {
  model: string;
  tokensPerSecond: number;
  latencyMs: number;
  ramUsedGb: number;
  promptTokens?: number;
  completionTokens?: number;
  completedAt: string;
}

export interface Host {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  ollama_version: string | null;
  default_model: string;
  installed_models: string[];
  disk_free_gb: number | null;
  context_summary: ContextSummaryEntry[];
  indexing_progress: HostIndexingProgress | null;
  status: HostStatus;
  last_seen_at: string | null;
  last_metrics: HostLastMetrics | null;
  created_at: string;
}

export interface PairingRequest {
  id: string;
  user_id: string;
  code: string;
  host_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      hosts: {
        Row: Host;
        Insert: {
          user_id: string;
          id?: string;
          name?: string;
          platform?: string;
          ollama_version?: string | null;
          default_model?: string;
          status?: HostStatus;
          last_seen_at?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          platform?: string;
          ollama_version?: string | null;
          default_model?: string;
          installed_models?: string[];
          disk_free_gb?: number | null;
          context_summary?: ContextSummaryEntry[];
          indexing_progress?: HostIndexingProgress | null;
          last_metrics?: HostLastMetrics | null;
          status?: HostStatus;
          last_seen_at?: string | null;
        };
        Relationships: [];
      };
      pairing_requests: {
        Row: PairingRequest;
        Insert: Partial<PairingRequest> & { user_id: string; code: string; expires_at: string };
        Update: Partial<PairingRequest>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
