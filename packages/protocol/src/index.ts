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
  HOST_STATUS: "host.status",
  PING: "ping",
  PONG: "pong",
} as const;

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
