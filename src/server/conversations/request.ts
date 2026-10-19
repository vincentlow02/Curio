import type { ConversationMessage } from "../../features/analysis/types";

export const MAX_CONVERSATION_REQUEST_BYTES = 1_500_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ConversationRequestError extends Error {
  constructor(message: string, readonly status: 400 | 413) {
    super(message);
    this.name = "ConversationRequestError";
  }
}

export type SaveConversationRequest = {
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
};

export async function readConversationRequest(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new ConversationRequestError("A JSON request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CONVERSATION_REQUEST_BYTES) {
        await reader.cancel();
        throw new ConversationRequestError("The conversation is too large to save.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof ConversationRequestError) throw error;
    throw new ConversationRequestError("The conversation request must contain valid JSON.", 400);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function validateConversationRequest(value: unknown): SaveConversationRequest {
  if (!isRecord(value)
    || typeof value.title !== "string"
    || value.title.trim().length < 1
    || value.title.length > 200
    || !isTimestamp(value.createdAt)
    || !isTimestamp(value.updatedAt)
    || !Array.isArray(value.messages)
    || value.messages.length < 1
    || value.messages.length > 100) {
    throw new ConversationRequestError("The conversation data is invalid.", 400);
  }

  const messages = value.messages.map((message): ConversationMessage => {
    if (!isRecord(message)
      || typeof message.id !== "string"
      || !UUID_PATTERN.test(message.id)
      || (message.role !== "user" && message.role !== "assistant")
      || typeof message.content !== "string"
      || message.content.length > 20_000
      || !isTimestamp(message.createdAt)
      || (message.attachmentName !== undefined && (typeof message.attachmentName !== "string" || message.attachmentName.length > 255))
      || (message.attachmentPath !== undefined && (typeof message.attachmentPath !== "string" || message.attachmentPath.length > 500))
      || (message.metadata !== null && !isRecord(message.metadata))) {
      throw new ConversationRequestError("A conversation message is invalid.", 400);
    }
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      metadata: message.metadata as ConversationMessage["metadata"],
      ...(typeof message.attachmentName === "string" ? { attachmentName: message.attachmentName } : {}),
      ...(typeof message.attachmentPath === "string" ? { attachmentPath: message.attachmentPath } : {}),
    };
  });

  if (messages.some((message) => message.metadata?.conversationImagePath !== undefined
    && (typeof message.metadata.conversationImagePath !== "string" || message.metadata.conversationImagePath.length > 500))) {
    throw new ConversationRequestError("A conversation attachment reference is invalid.", 400);
  }

  return {
    title: value.title.trim(),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages,
  };
}

export function isConversationId(value: string): boolean {
  return UUID_PATTERN.test(value);
}
