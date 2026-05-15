export type HostStatus = "offline" | "online" | "busy";

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
}

export interface Host {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  ollama_version: string | null;
  default_model: string;
  status: HostStatus;
  last_seen_at: string | null;
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
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile> };
      hosts: { Row: Host; Insert: Partial<Host> & { user_id: string }; Update: Partial<Host> };
      pairing_requests: {
        Row: PairingRequest;
        Insert: Partial<PairingRequest> & { user_id: string; code: string; expires_at: string };
        Update: Partial<PairingRequest>;
      };
    };
  };
}
