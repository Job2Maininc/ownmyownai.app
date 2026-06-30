import { describe, expect, it } from "vitest";
import {
  ChatAgentStepPayloadSchema,
  ChatCitationsPayloadSchema,
  ChatStartPayloadSchema,
  ChatQueuedPayloadSchema,
  ChatThinkingDeltaPayloadSchema,
  CloudProviderStatusSchema,
  CreateSharePayloadSchema,
  ProjectListPayloadSchema,
  parseEnvelope,
  HistoryForkPayloadSchema,
  InlineEditPreviewRequestSchema,
  McpCallPayloadSchema,
  McpServerSummarySchema,
  McpToolDescriptorSchema,
  MediaDonePayloadSchema,
  MediaGeneratePayloadSchema,
  MediaProgressPayloadSchema,
  PatchPreviewRequestSchema,
  PatchPreviewResponseSchema,
  PlaybookRunPayloadSchema,
  RelayWebClientsPayloadSchema,
  ShareMessageSchema,
  TerminalExecPayloadSchema,
  WS_MESSAGE_TYPES,
} from "../index";

describe("protocol", () => {
  it("parse chat.agent.step payload", () => {
    const payload = ChatAgentStepPayloadSchema.parse({
      step: 2,
      maxSteps: 10,
      tool: "read_file",
      status: "running",
    });
    expect(payload.tool).toBe("read_file");
    expect(WS_MESSAGE_TYPES.CHAT_AGENT_STEP).toBe("chat.agent.step");
  });

  it("parse chat.start avec enableTools pour outils locaux", () => {
    const payload = ChatStartPayloadSchema.parse({
      messages: [{ role: "user", content: "Liste le dossier lié" }],
      contextIds: ["kb-1"],
      enableTools: true,
    });
    expect(payload.enableTools).toBe(true);
  });

  it("parse chat.start avec taskIntent pour routage multi-modèle", () => {
    const payload = ChatStartPayloadSchema.parse({
      messages: [{ role: "user", content: "Résume ce texte" }],
      taskIntent: "summary",
    });
    expect(payload.taskIntent).toBe("summary");
  });

  it("parse chat.start avec thinkingMode", () => {
    const payload = ChatStartPayloadSchema.parse({
      messages: [{ role: "user", content: "Bonjour" }],
      thinkingMode: true,
    });
    expect(payload.thinkingMode).toBe(true);
    expect(WS_MESSAGE_TYPES.CHAT_THINKING_DELTA).toBe("chat.thinking_delta");
  });

  it("parse chat.citations payload", () => {
    const payload = ChatCitationsPayloadSchema.parse({
      citations: [
        {
          index: 1,
          source: "…notes.md",
          sourceFull: "C:\\docs\\notes.md",
          excerpt: "Extrait pertinent…",
          score: 0.82,
          chunkId: "chunk-1",
          documentId: "doc-1",
        },
      ],
    });
    expect(payload.citations).toHaveLength(1);
    expect(WS_MESSAGE_TYPES.CHAT_CITATIONS).toBe("chat.citations");
  });

  it("parse chat.thinking_delta payload", () => {
    const payload = ChatThinkingDeltaPayloadSchema.parse({ thinking: "étape 1" });
    expect(payload.thinking).toBe("étape 1");
  });

  it("parse chat.start avec projectId", () => {
    const payload = ChatStartPayloadSchema.parse({
      messages: [{ role: "user", content: "Bonjour" }],
      projectId: "proj-1",
    });
    expect(payload.projectId).toBe("proj-1");
  });

  it("parse project.list payload", () => {
    const payload = ProjectListPayloadSchema.parse({
      projects: [
        {
          id: "p1",
          name: "Mon projet",
          knowledgeBaseIds: ["kb-1"],
          createdAt: "2026-06-08T00:00:00Z",
          updatedAt: "2026-06-08T00:00:00Z",
        },
      ],
      activeProjectId: "p1",
    });
    expect(payload.projects).toHaveLength(1);
    expect(WS_MESSAGE_TYPES.PROJECT_OPEN).toBe("project.open");
  });

  it("parse chat.start avec mentionScope", () => {
    const payload = ChatStartPayloadSchema.parse({
      messages: [{ role: "user", content: "Quelle est la dernière note ?" }],
      contextIds: ["kb-notes"],
      mentionScope: { baseNames: ["Notes"] },
    });
    expect(payload.mentionScope?.baseNames).toEqual(["Notes"]);
  });

  it("valide payload partage lecture seule", () => {
    const payload = CreateSharePayloadSchema.parse({
      hostId: "550e8400-e29b-41d4-a716-446655440000",
      messages: [{ role: "user", content: "Bonjour" }],
      ttlHours: 24,
    });
    expect(payload.messages).toHaveLength(1);
    expect(ShareMessageSchema.parse({ role: "assistant", content: "Salut" }).role).toBe(
      "assistant",
    );
  });

  it("parse playbook.run payload", () => {
    const payload = PlaybookRunPayloadSchema.parse({
      playbookId: "summarize-folder",
      contextIds: ["kb-1"],
      model: "llama3.2:3b",
    });
    expect(payload.playbookId).toBe("summarize-folder");
  });

  it("parse history.fork", () => {
    const payload = HistoryForkPayloadSchema.parse({
      parentThreadId: "thread-1",
      forkAtIndex: 2,
      contextIds: ["kb-1"],
    });
    expect(payload.parentThreadId).toBe("thread-1");
    expect(payload.forkAtIndex).toBe(2);
    expect(WS_MESSAGE_TYPES.HISTORY_FORK).toBe("history.fork");
  });

  it("parse envelope WS", () => {
    const env = parseEnvelope(
      JSON.stringify({
        type: WS_MESSAGE_TYPES.CONTEXT_LIST,
        payload: { bases: [] },
        requestId: "abc",
      }),
    );
    expect(env?.type).toBe("context.list");
  });

  it("valide relay.web_clients", () => {
    const payload = RelayWebClientsPayloadSchema.parse({ count: 2 });
    expect(payload.count).toBe(2);
    expect(WS_MESSAGE_TYPES.RELAY_WEB_CLIENTS).toBe("relay.web_clients");
  });

  it("parse terminal.exec payload", () => {
    const payload = TerminalExecPayloadSchema.parse({
      program: "git",
      args: ["status"],
      timeoutSecs: 60,
    });
    expect(payload.program).toBe("git");
    expect(payload.args).toEqual(["status"]);
  });

  it("expose terminal WS message types", () => {
    expect(WS_MESSAGE_TYPES.TERMINAL_EXEC).toBe("terminal.exec");
    expect(WS_MESSAGE_TYPES.TERMINAL_OUTPUT).toBe("terminal.output");
    expect(WS_MESSAGE_TYPES.TERMINAL_DONE).toBe("terminal.done");
    expect(WS_MESSAGE_TYPES.TERMINAL_ERROR).toBe("terminal.error");
  });

  it("valide patch.preview / patch.previewed", () => {
    const request = PatchPreviewRequestSchema.parse({
      path: "C:\\projets\\app\\src\\lib.rs",
      patch: "@@ -1 +1 @@\n-old\n+new\n",
      contextIds: ["kb-1"],
    });
    expect(request.patch).toContain("@@");

    const response = PatchPreviewResponseSchema.parse({
      path: "C:\\projets\\app\\src\\lib.rs",
      patch: request.patch,
      linesAdded: 1,
      linesRemoved: 1,
      hunks: 1,
    });
    expect(response.hunks).toBe(1);
    expect(WS_MESSAGE_TYPES.PATCH_PREVIEW).toBe("patch.preview");
    expect(WS_MESSAGE_TYPES.PATCH_APPLY).toBe("patch.apply");
  });

  it("parse inline_edit.preview payload", () => {
    const payload = InlineEditPreviewRequestSchema.parse({
      documentId: "doc-1",
      selectedText: "Paragraphe original",
      instruction: "Reformuler",
    });
    expect(payload.documentId).toBe("doc-1");
    expect(WS_MESSAGE_TYPES.INLINE_EDIT_PREVIEW).toBe("inline_edit.preview");
    expect(WS_MESSAGE_TYPES.INLINE_EDIT_APPLIED).toBe("inline_edit.applied");
  });

  it("parse CloudProviderStatus sans exposer de clé API", () => {
    const status = CloudProviderStatusSchema.parse({
      id: "openai",
      configured: true,
      enabled: true,
      models: ["openai:gpt-4o-mini"],
    });
    expect(status.configured).toBe(true);
    expect(status.models[0]).toMatch(/^openai:/);
  });

  it("valide MCP list/call via relay", () => {
    const server = McpServerSummarySchema.parse({
      id: "builtin-fs",
      name: "Fichiers locaux",
      kind: "builtin",
      enabled: true,
      args: [],
      toolCount: 4,
    });
    expect(server.kind).toBe("builtin");

    const tool = McpToolDescriptorSchema.parse({
      serverId: "builtin-fs",
      serverName: "Fichiers locaux",
      name: "read_file",
      qualifiedName: "mcp/builtin-fs/read_file",
      inputSchema: { type: "object" },
    });
    expect(tool.qualifiedName).toContain("read_file");

    const call = McpCallPayloadSchema.parse({
      qualifiedName: "mcp/builtin-fs/list_dir",
      arguments: { path: "C:\\docs" },
      contextIds: ["kb-1"],
    });
    expect(call.qualifiedName).toBe("mcp/builtin-fs/list_dir");
    expect(WS_MESSAGE_TYPES.MCP_CALL).toBe("mcp.call");
    expect(WS_MESSAGE_TYPES.MCP_RESULT).toBe("mcp.result");
  });

  it("parse chat.queued payload", () => {
    const payload = ChatQueuedPayloadSchema.parse({
      position: 2,
      waitingAhead: 1,
    });
    expect(payload.position).toBe(2);
    expect(WS_MESSAGE_TYPES.CHAT_QUEUED).toBe("chat.queued");
  });

  it("parse media.generate / progress / done payloads", () => {
    const generate = MediaGeneratePayloadSchema.parse({
      kind: "image",
      prompt: "Paysage montagne au coucher du soleil",
      model: "flux",
    });
    expect(generate.kind).toBe("image");

    const progress = MediaProgressPayloadSchema.parse({
      jobId: "media-1",
      kind: "image",
      status: "running",
      progress: 42,
      message: "Rendu en cours…",
    });
    expect(progress.progress).toBe(42);

    const done = MediaDonePayloadSchema.parse({
      jobId: "media-1",
      kind: "image",
      filename: "sunset.png",
      filepath: "C:\\Users\\me\\.ownmyownai\\creatives\\sunset.png",
      mimeType: "image/png",
      bytes: 204800,
    });
    expect(done.filename).toBe("sunset.png");
    expect(WS_MESSAGE_TYPES.MEDIA_GENERATE).toBe("media.generate");
    expect(WS_MESSAGE_TYPES.MEDIA_PROGRESS).toBe("media.progress");
    expect(WS_MESSAGE_TYPES.MEDIA_DONE).toBe("media.done");
  });
});
