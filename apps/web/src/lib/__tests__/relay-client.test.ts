import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatStartPayloadSchema,
  parseEnvelope,
  WS_MESSAGE_TYPES,
  type WsEnvelope,
} from "@ownmyownai/protocol";
import { RelayClient } from "../relay-client";

type RelayClientInternals = RelayClient & {
  ws: WebSocket | null;
  handleMessage: (envelope: WsEnvelope) => void;
};

function attachOpenSocket(client: RelayClient) {
  const sent: string[] = [];
  const mockWs = {
    readyState: WebSocket.OPEN,
    send: vi.fn((data: string) => {
      sent.push(data);
    }),
  };
  (client as RelayClientInternals).ws = mockWs as unknown as WebSocket;
  return { sent, mockWs };
}

function dispatchRelayMessage(client: RelayClient, body: Record<string, unknown>) {
  const envelope = parseEnvelope(JSON.stringify(body));
  expect(envelope).not.toBeNull();
  (client as RelayClientInternals).handleMessage(envelope!);
}

function parseLastChatStart(sent: string[]) {
  const envelope = parseEnvelope(sent.at(-1) ?? "");
  expect(envelope?.type).toBe(WS_MESSAGE_TYPES.CHAT_START);
  return ChatStartPayloadSchema.parse(envelope?.payload);
}

describe("RelayClient.sendChat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("inclut mentionScope dans le payload chat.start", () => {
    const client = new RelayClient({ mintToken: vi.fn() });
    const { sent } = attachOpenSocket(client);
    const mentionScope = { baseNames: ["Notes"], fileHints: ["README.md"] };

    const requestId = client.sendChat(
      [{ role: "user", content: "Quelle est la dernière note ?" }],
      "qwen2.5:7b",
      ["kb-notes"],
      undefined,
      "req-mention",
      undefined,
      mentionScope,
    );

    expect(requestId).toBe("req-mention");
    const payload = parseLastChatStart(sent);
    expect(payload.mentionScope).toEqual(mentionScope);
    expect(payload.contextIds).toEqual(["kb-notes"]);
  });

  it("inclut enableTools dans le payload chat.start", () => {
    const client = new RelayClient({ mintToken: vi.fn() });
    const { sent } = attachOpenSocket(client);

    const requestId = client.sendChat(
      [{ role: "user", content: "Liste le dossier lié" }],
      "qwen2.5:7b",
      ["kb-docs"],
      undefined,
      "req-tools",
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(requestId).toBe("req-tools");
    const payload = parseLastChatStart(sent);
    expect(payload.enableTools).toBe(true);
  });

  it("transmet mentionScope et enableTools ensemble", () => {
    const client = new RelayClient({ mintToken: vi.fn() });
    const { sent } = attachOpenSocket(client);
    const mentionScope = { folderHints: ["docs"] };

    client.sendChat(
      [{ role: "user", content: "@dossier:docs liste les fichiers" }],
      "llama3.2:3b",
      ["kb-project"],
      "thread-1",
      "req-combined",
      "proj-1",
      mentionScope,
      true,
      true,
      "writing",
    );

    const payload = parseLastChatStart(sent);
    expect(payload.mentionScope).toEqual(mentionScope);
    expect(payload.enableTools).toBe(true);
    expect(payload.thinkingMode).toBe(true);
    expect(payload.taskIntent).toBe("writing");
    expect(payload.threadId).toBe("thread-1");
    expect(payload.projectId).toBe("proj-1");
  });

  it("signale une erreur si le relais n'est pas connecté", () => {
    const onError = vi.fn();
    const client = new RelayClient({ mintToken: vi.fn(), onError });

    const requestId = client.sendChat(
      [{ role: "user", content: "Bonjour" }],
      undefined,
      [],
      undefined,
      "req-offline",
      undefined,
      { baseNames: ["Notes"] },
      undefined,
      true,
    );

    expect(requestId).toBeUndefined();
    expect(onError).toHaveBeenCalledWith("Non connecté au relais");
  });
});

describe("RelayClient memory.*", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("envoie memory.list et résout l'état", async () => {
    const client = new RelayClient({ mintToken: vi.fn() });
    const { sent } = attachOpenSocket(client);

    const promise = client.listMemory();
    const envelope = parseEnvelope(sent.at(-1) ?? "");
    expect(envelope?.type).toBe(WS_MESSAGE_TYPES.MEMORY_LIST);

    dispatchRelayMessage(client, {
      type: WS_MESSAGE_TYPES.MEMORY_LIST,
      requestId: envelope?.requestId,
      payload: {
        enabled: true,
        facts: [
          {
            id: "fact-1",
            content: "Préfère le français",
            createdAt: "2026-06-30T10:00:00Z",
            updatedAt: "2026-06-30T10:00:00Z",
          },
        ],
      },
    });

    await expect(promise).resolves.toEqual({
      enabled: true,
      facts: [
        {
          id: "fact-1",
          content: "Préfère le français",
          createdAt: "2026-06-30T10:00:00Z",
          updatedAt: "2026-06-30T10:00:00Z",
        },
      ],
    });
  });

  it("envoie memory.add et retourne le fait créé", async () => {
    const client = new RelayClient({ mintToken: vi.fn() });
    const { sent } = attachOpenSocket(client);

    const promise = client.addMemoryFact("Réponses concises");
    const envelope = parseEnvelope(sent.at(-1) ?? "");
    expect(envelope?.type).toBe(WS_MESSAGE_TYPES.MEMORY_ADD);
    expect(envelope?.payload).toEqual({ content: "Réponses concises" });

    const fact = {
      id: "fact-2",
      content: "Réponses concises",
      createdAt: "2026-06-30T11:00:00Z",
      updatedAt: "2026-06-30T11:00:00Z",
    };
    dispatchRelayMessage(client, {
      type: WS_MESSAGE_TYPES.MEMORY_ADDED,
      requestId: envelope?.requestId,
      payload: { fact },
    });

    await expect(promise).resolves.toEqual(fact);
  });

  it("envoie memory.delete", async () => {
    const client = new RelayClient({ mintToken: vi.fn() });
    const { sent } = attachOpenSocket(client);

    const promise = client.deleteMemoryFact("fact-1");
    const envelope = parseEnvelope(sent.at(-1) ?? "");
    expect(envelope?.type).toBe(WS_MESSAGE_TYPES.MEMORY_DELETE);
    expect(envelope?.payload).toEqual({ id: "fact-1" });

    dispatchRelayMessage(client, {
      type: WS_MESSAGE_TYPES.MEMORY_DELETED,
      requestId: envelope?.requestId,
      payload: {},
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it("envoie memory.setEnabled", async () => {
    const client = new RelayClient({ mintToken: vi.fn() });
    const { sent } = attachOpenSocket(client);

    const promise = client.setMemoryEnabled(false);
    const envelope = parseEnvelope(sent.at(-1) ?? "");
    expect(envelope?.type).toBe(WS_MESSAGE_TYPES.MEMORY_SET_ENABLED);
    expect(envelope?.payload).toEqual({ enabled: false });

    dispatchRelayMessage(client, {
      type: WS_MESSAGE_TYPES.MEMORY_UPDATED,
      requestId: envelope?.requestId,
      payload: { enabled: false },
    });

    await expect(promise).resolves.toBe(false);
  });
});
