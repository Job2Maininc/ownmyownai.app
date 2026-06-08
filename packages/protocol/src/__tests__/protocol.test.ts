import { describe, expect, it } from "vitest";
import {
  ChatStartPayloadSchema,
  parseEnvelope,
  WS_MESSAGE_TYPES,
} from "../index";

describe("protocol", () => {
  it("parse chat.start avec contextIds", () => {
    const payload = ChatStartPayloadSchema.parse({
      messages: [{ role: "user", content: "Bonjour" }],
      model: "llama3.2:3b",
      contextIds: ["kb-1"],
    });
    expect(payload.contextIds).toEqual(["kb-1"]);
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
});
