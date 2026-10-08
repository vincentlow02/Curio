import type { RecentAnalysisRecord } from "../types";
import { deleteRecentImage } from "../storage/recent-image-store";

export const HISTORY_STORAGE_KEY = "qwen-collectible-recent-v1";
const MAX_HISTORY_RECORDS = 12;

type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): HistoryStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function loadAnalysisHistory(storage: HistoryStorage | null = browserStorage()): RecentAnalysisRecord[] {
  if (!storage) return [];
  try {
    const stored = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(stored) ? stored.slice(0, MAX_HISTORY_RECORDS) as RecentAnalysisRecord[] : [];
  } catch {
    storage.removeItem(HISTORY_STORAGE_KEY);
    return [];
  }
}

export function saveAnalysisHistory(
  current: RecentAnalysisRecord[],
  record: RecentAnalysisRecord,
  storage: HistoryStorage | null = browserStorage(),
): RecentAnalysisRecord[] {
  const existingIndex = current.findIndex((item) => item.id === record.id);
  const next = existingIndex < 0
    ? [record, ...current].slice(0, MAX_HISTORY_RECORDS)
    : current.map((item) => item.id === record.id ? record : item);
  const retainedIds = new Set(next.map((item) => item.id));
  for (const removed of current) {
    if (!retainedIds.has(removed.id)) void deleteRecentImage(removed.id).catch(() => undefined);
  }
  if (storage) storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function promoteAnalysisHistory(
  current: RecentAnalysisRecord[],
  id: string,
  storage: HistoryStorage | null = browserStorage(),
): RecentAnalysisRecord[] {
  const record = current.find((item) => item.id === id);
  if (!record || current[0]?.id === id) return current;
  const next = [record, ...current.filter((item) => item.id !== id)];
  if (storage) storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteAnalysisHistory(
  current: RecentAnalysisRecord[],
  id: string,
  storage: HistoryStorage | null = browserStorage(),
): RecentAnalysisRecord[] {
  const next = current.filter((record) => record.id !== id);
  void deleteRecentImage(id).catch(() => undefined);
  if (storage) storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}
