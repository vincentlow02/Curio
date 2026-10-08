import type { RecentAnalysisRecord } from "../types";
import { deleteRecentImage, loadRecentImage, saveRecentImage } from "../storage/recent-image-store";

export const HISTORY_STORAGE_KEY = "qwen-collectible-recent-v1";
const MAX_HISTORY_RECORDS = 12;

type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AnalysisHistoryLoadResult =
  | { status: "loaded"; records: RecentAnalysisRecord[] }
  | { status: "unavailable"; reason: "read-failed" | "invalid-json" | "invalid-shape" };

export type AnalysisHistoryMutationResult = {
  records: RecentAnalysisRecord[];
  status: "saved" | "protected";
};

export function saveAnalysisImage(id: string, file: File): Promise<void> {
  return saveRecentImage(id, file);
}

export function loadAnalysisImage(id: string): Promise<File | null> {
  return loadRecentImage(id);
}

export function deleteAnalysisImage(id: string): Promise<void> {
  return deleteRecentImage(id);
}

function browserStorage(): HistoryStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function readAnalysisHistory(storage: HistoryStorage | null = browserStorage()): AnalysisHistoryLoadResult {
  if (!storage) return { status: "loaded", records: [] };
  let serialized: string | null;
  try {
    serialized = storage.getItem(HISTORY_STORAGE_KEY);
  } catch {
    return { status: "unavailable", reason: "read-failed" };
  }

  let stored: unknown;
  try {
    stored = JSON.parse(serialized ?? "[]") as unknown;
  } catch {
    return { status: "unavailable", reason: "invalid-json" };
  }

  if (!Array.isArray(stored)) return { status: "unavailable", reason: "invalid-shape" };
  return { status: "loaded", records: stored.slice(0, MAX_HISTORY_RECORDS) as RecentAnalysisRecord[] };
}

export function loadAnalysisHistory(storage: HistoryStorage | null = browserStorage()): RecentAnalysisRecord[] {
  const result = readAnalysisHistory(storage);
  return result.status === "loaded" ? result.records : [];
}

export function saveAnalysisHistory(
  current: RecentAnalysisRecord[],
  record: RecentAnalysisRecord,
  storage: HistoryStorage | null = browserStorage(),
): AnalysisHistoryMutationResult {
  const writableHistory = getWritableHistory(current, storage);
  if (writableHistory.status === "protected") return writableHistory;
  const existingIndex = writableHistory.records.findIndex((item) => item.id === record.id);
  const next = existingIndex < 0
    ? [record, ...writableHistory.records].slice(0, MAX_HISTORY_RECORDS)
    : writableHistory.records.map((item) => item.id === record.id ? record : item);
  const retainedIds = new Set(next.map((item) => item.id));
  persistHistory(next, storage);
  deleteRemovedImages(writableHistory.records, retainedIds);
  return { records: next, status: "saved" };
}

export function promoteAnalysisHistory(
  current: RecentAnalysisRecord[],
  id: string,
  storage: HistoryStorage | null = browserStorage(),
): AnalysisHistoryMutationResult {
  const writableHistory = getWritableHistory(current, storage);
  if (writableHistory.status === "protected") return writableHistory;
  const record = writableHistory.records.find((item) => item.id === id);
  if (!record || writableHistory.records[0]?.id === id) return { records: writableHistory.records, status: "saved" };
  const next = [record, ...writableHistory.records.filter((item) => item.id !== id)];
  persistHistory(next, storage);
  return { records: next, status: "saved" };
}

export function deleteAnalysisHistory(
  current: RecentAnalysisRecord[],
  id: string,
  storage: HistoryStorage | null = browserStorage(),
): AnalysisHistoryMutationResult {
  const writableHistory = getWritableHistory(current, storage);
  if (writableHistory.status === "protected") return writableHistory;
  const next = writableHistory.records.filter((record) => record.id !== id);
  persistHistory(next, storage);
  void deleteAnalysisImage(id).catch(() => undefined);
  return { records: next, status: "saved" };
}

function getWritableHistory(
  current: RecentAnalysisRecord[],
  storage: HistoryStorage | null,
): AnalysisHistoryMutationResult {
  if (!storage) return { records: current, status: "saved" };
  const result = readAnalysisHistory(storage);
  if (result.status === "unavailable") return { records: current, status: "protected" };
  return { records: result.records, status: "saved" };
}

function persistHistory(records: RecentAnalysisRecord[], storage: HistoryStorage | null): void {
  storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
}

function deleteRemovedImages(records: RecentAnalysisRecord[], retainedIds: Set<string>): void {
  for (const removed of records) {
    if (!retainedIds.has(removed.id)) void deleteAnalysisImage(removed.id).catch(() => undefined);
  }
}
