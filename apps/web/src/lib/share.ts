import {
  CreateSharePayloadSchema,
  ShareMessageSchema,
  ShareViewSchema,
  type ShareMessage,
} from "@ownmyownai/protocol";
import { createClient } from "@/lib/supabase/client";

function getFunctionsUrl() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
}

export interface CreateShareResponse {
  token: string;
  title: string;
  expires_at: string;
  share_url: string;
}

export interface ShareViewResponse {
  title: string;
  messages: ShareMessage[];
  expires_at: string;
  created_at: string;
}

export function toShareMessages(
  messages: { role: "user" | "assistant"; content: string }[],
): ShareMessage[] {
  return messages
    .filter((m) => m.content.trim())
    .map((m) => ShareMessageSchema.parse(m));
}

export async function createConversationShare(input: {
  hostId: string;
  title?: string;
  messages: ShareMessage[];
  ttlHours?: number;
}): Promise<CreateShareResponse> {
  const payload = CreateSharePayloadSchema.parse({
    hostId: input.hostId,
    title: input.title,
    messages: input.messages,
    ttlHours: input.ttlHours,
  });

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${getFunctionsUrl()}/create-conversation-share`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      host_id: payload.hostId,
      title: payload.title,
      messages: payload.messages,
      ttl_hours: payload.ttlHours,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? "Impossible de créer le lien de partage");
  }
  return json as CreateShareResponse;
}

export async function getConversationShare(token: string): Promise<ShareViewResponse> {
  const res = await fetch(`${getFunctionsUrl()}/get-conversation-share`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ token }),
  });

  const json = await res.json();
  if (!res.ok) {
    const message = json.error ?? "Lien introuvable";
    const err = new Error(message) as Error & { expired?: boolean };
    err.expired = Boolean(json.expired);
    throw err;
  }

  const parsed = ShareViewSchema.parse({
    title: json.title,
    messages: json.messages,
    expiresAt: json.expires_at,
    createdAt: json.created_at,
  });

  return {
    title: parsed.title,
    messages: parsed.messages,
    expires_at: parsed.expiresAt,
    created_at: parsed.createdAt,
  };
}
