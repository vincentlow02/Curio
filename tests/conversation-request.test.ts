import { describe, expect, it } from "vitest";
import {
  ConversationRequestError,
  MAX_CONVERSATION_REQUEST_BYTES,
  readConversationRequest,
  validateConversationRequest,
} from "../src/server/conversations/request";

const conversationId = "58df9309-c2df-4cc8-9ad2-8e89f9ee16c3";
const messageId = "f574b89d-1db4-4b67-92c7-fcd44f41e68e";
const timestamp = "2026-10-19T13:00:00.000Z";

function validConversation(): unknown {
  return {
    title: "Vintage figure",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [{
      id: messageId,
      role: "user",
      content: "Identify this figure",
      createdAt: timestamp,
      metadata: null,
    }],
    id: conversationId,
  };
}

describe("conversation request validation", () => {
  it("accepts a bounded conversation and normalizes its title", () => {
    const conversation = validConversation() as Record<string, unknown>;
    conversation.title = "  Vintage figure  ";

    expect(validateConversationRequest(conversation)).toMatchObject({
      title: "Vintage figure",
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [{ id: messageId, role: "user", content: "Identify this figure", metadata: null }],
    });
  });

  it("rejects malformed identifiers, roles, and oversized message bodies", () => {
    const invalidId = validConversation() as { messages: Array<Record<string, unknown>> };
    invalidId.messages[0]!.id = "not-a-uuid";
    expect(() => validateConversationRequest(invalidId)).toThrow(ConversationRequestError);

    const invalidRole = validConversation() as { messages: Array<Record<string, unknown>> };
    invalidRole.messages[0]!.role = "system";
    expect(() => validateConversationRequest(invalidRole)).toThrow(ConversationRequestError);

    const oversized = validConversation() as { messages: Array<Record<string, unknown>> };
    oversized.messages[0]!.content = "x".repeat(20_001);
    expect(() => validateConversationRequest(oversized)).toThrow(ConversationRequestError);
  });

  it("rejects request bodies above the byte limit before parsing JSON", async () => {
    const request = new Request("https://curio.example/api/conversations/id", {
      method: "PUT",
      body: JSON.stringify({ data: "x".repeat(MAX_CONVERSATION_REQUEST_BYTES) }),
    });

    await expect(readConversationRequest(request)).rejects.toMatchObject({
      name: "ConversationRequestError",
      status: 413,
    });
  });
});
