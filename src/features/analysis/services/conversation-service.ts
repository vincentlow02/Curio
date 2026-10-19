import type { ConversationRecord, ConversationSummary } from "../types";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as { error?: unknown } | T;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "The conversation request could not be completed.";
    throw new Error(message);
  }
  return body as T;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch("/api/conversations", { cache: "no-store" });
  return readResponse<ConversationSummary[]>(response);
}

export async function getConversation(id: string): Promise<ConversationRecord> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
  return readResponse<ConversationRecord>(response);
}

export async function saveConversation(conversation: ConversationRecord): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conversation),
  });
  await readResponse<{ id: string }>(response);
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  await readResponse<{ deleted: boolean }>(response);
}

export async function uploadConversationImage(conversationId: string, file: File): Promise<string> {
  const form = new FormData();
  form.set("image", file);
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/images`, { method: "POST", body: form });
  const body = await readResponse<{ path: string }>(response);
  return body.path;
}

export async function getConversationImageUrl(conversationId: string, path: string): Promise<string> {
  const url = new URL(`/api/conversations/${encodeURIComponent(conversationId)}/images`, window.location.origin);
  url.searchParams.set("path", path);
  const response = await fetch(url, { cache: "no-store" });
  const body = await readResponse<{ signedUrl: string }>(response);
  return body.signedUrl;
}

const OAUTH_DRAFT_KEY = "curio-oauth-conversation-draft-v1";
const OAUTH_DRAFT_TTL_MS = 10 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isConversation(value: unknown): value is ConversationRecord {
  if (!isRecord(value) || typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || typeof value.title !== "string" || !value.title.trim() || value.title.length > 200
    || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)
    || !Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 100) return false;

  return value.messages.every((message) => {
    if (!isRecord(message) || typeof message.id !== "string" || !UUID_PATTERN.test(message.id)
      || (message.role !== "user" && message.role !== "assistant")
      || typeof message.content !== "string" || message.content.length > 20_000
      || !isTimestamp(message.createdAt)
      || (message.attachmentName !== undefined && (typeof message.attachmentName !== "string" || message.attachmentName.length > 255))
      || (message.attachmentPath !== undefined && (typeof message.attachmentPath !== "string" || message.attachmentPath.length > 500))) return false;
    if (message.metadata === null) return true;
    const metadata = message.metadata;
    return message.role === "assistant" && isRecord(metadata) && metadata.id === message.id
      && typeof metadata.title === "string" && metadata.title.length <= 200
      && typeof metadata.submittedText === "string" && metadata.submittedText.length <= 2_000
      && (metadata.recognition === null || isRecord(metadata.recognition))
      && (metadata.result === null || isRecord(metadata.result))
      && Array.isArray(metadata.toolActivity)
      && isTimestamp(metadata.createdAt)
      && (metadata.followups === undefined || Array.isArray(metadata.followups));
  });
}

export function saveOAuthConversationDraft(conversation: ConversationRecord, now = Date.now()): void {
  sessionStorage.setItem(OAUTH_DRAFT_KEY, JSON.stringify({ savedAt: now, conversation }));
}

export function readOAuthConversationDraft(now = Date.now()): ConversationRecord | null {
  const stored = sessionStorage.getItem(OAUTH_DRAFT_KEY);
  if (!stored) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored) as unknown;
  } catch {
    clearOAuthConversationDraft();
    throw new Error("The sign-in draft could not be read. The temporary draft was removed.");
  }

  if (!isRecord(value) || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)
    || value.savedAt > now || !("conversation" in value) || !isConversation(value.conversation)) {
    clearOAuthConversationDraft();
    throw new Error("The sign-in draft is invalid. The temporary draft was removed.");
  }
  if (value.savedAt + OAUTH_DRAFT_TTL_MS <= now) {
    clearOAuthConversationDraft();
    return null;
  }
  return value.conversation;
}

export function clearOAuthConversationDraft(): void {
  sessionStorage.removeItem(OAUTH_DRAFT_KEY);
}
