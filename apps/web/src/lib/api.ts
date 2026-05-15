import { createClient } from "@/lib/supabase/client";

function getFunctionsUrl() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
}

export async function invokeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${getFunctionsUrl()}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? "Request failed");
  }
  return json as T;
}

export interface PairingCodeResponse {
  code: string;
  expires_at: string;
  pairing_url: string;
}

export interface RelayTokenResponse {
  token: string;
  relay_url: string;
  expires_at: number;
}

export async function createPairingCode(): Promise<PairingCodeResponse> {
  return invokeFunction("create-pairing-code");
}

export async function mintRelayToken(hostId: string): Promise<RelayTokenResponse> {
  return invokeFunction("mint-relay-token", { host_id: hostId });
}
