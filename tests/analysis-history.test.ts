import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentAnalysisRecord } from "../src/features/analysis/types";

const { deleteRecentImage } = vi.hoisted(() => ({ deleteRecentImage: vi.fn(async (_id: string): Promise<void> => undefined) }));
vi.mock("../src/features/analysis/storage/recent-image-store", () => ({ deleteRecentImage }));

import {
  deleteAnalysisHistory,
  HISTORY_STORAGE_KEY,
  loadAnalysisHistory,
  promoteAnalysisHistory,
  saveAnalysisHistory,
} from "../src/features/analysis/services/history-service";

function record(id: string, title = id): RecentAnalysisRecord {
  return {
    id,
    title,
    submittedText: title,
    recognition: null,
    result: null,
    toolActivity: [],
    createdAt: "2026-10-08T00:00:00.000Z",
  };
}

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    read: (key: string) => values.get(key) ?? null,
  };
}

describe("analysis history persistence", () => {
  beforeEach(() => deleteRecentImage.mockClear());

  it("loads records from the existing key and preserves the twelve-record limit", () => {
    const records = Array.from({ length: 14 }, (_, index) => record(`run-${index}`));
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(records) });

    expect(loadAnalysisHistory(storage)).toEqual(records.slice(0, 12));
    expect(storage.getItem).toHaveBeenCalledWith("qwen-collectible-recent-v1");
  });

  it("returns an empty history when missing or non-array data is stored", () => {
    expect(loadAnalysisHistory(createStorage())).toEqual([]);
    expect(loadAnalysisHistory(createStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify({ invalid: true }) }))).toEqual([]);
  });

  it("removes malformed stored JSON while preserving the existing storage key", () => {
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: "{invalid" });

    expect(loadAnalysisHistory(storage)).toEqual([]);
    expect(storage.removeItem).toHaveBeenCalledWith(HISTORY_STORAGE_KEY);
    expect(storage.read(HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("clears history after a storage read failure and propagates cleanup failures", () => {
    const readFailure = createStorage();
    readFailure.getItem.mockImplementation(() => { throw new Error("Storage unavailable"); });
    expect(loadAnalysisHistory(readFailure)).toEqual([]);
    expect(readFailure.removeItem).toHaveBeenCalledWith(HISTORY_STORAGE_KEY);

    const cleanupFailure = createStorage({ [HISTORY_STORAGE_KEY]: "{" });
    cleanupFailure.removeItem.mockImplementation(() => { throw new Error("Cleanup unavailable"); });
    expect(() => loadAnalysisHistory(cleanupFailure)).toThrow("Cleanup unavailable");
  });

  it("prepends new records, updates existing records in place, and persists the same schema", () => {
    const original = [record("a"), record("b")];
    const storage = createStorage();

    const inserted = saveAnalysisHistory(original, record("c"), storage);
    expect(inserted.map((item) => item.id)).toEqual(["c", "a", "b"]);

    const updated = saveAnalysisHistory(inserted, record("a", "Updated"), storage);
    expect(updated.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(updated[1]?.title).toBe("Updated");
    expect(JSON.parse(storage.read(HISTORY_STORAGE_KEY) ?? "[]")).toEqual(updated);
  });

  it("caps new history at twelve and deletes image data for records removed by the cap", () => {
    const original = Array.from({ length: 12 }, (_, index) => record(`run-${index}`));
    const storage = createStorage();

    const next = saveAnalysisHistory(original, record("new"), storage);

    expect(next).toHaveLength(12);
    expect(next[0]?.id).toBe("new");
    expect(next.at(-1)?.id).toBe("run-10");
    expect(deleteRecentImage).toHaveBeenCalledWith("run-11");
  });

  it("promotes an existing record without changing its data or adding missing records", () => {
    const current = [record("a"), record("b")];
    const storage = createStorage();

    expect(promoteAnalysisHistory(current, "b", storage).map((item) => item.id)).toEqual(["b", "a"]);
    expect(JSON.parse(storage.read(HISTORY_STORAGE_KEY) ?? "[]").map((item: RecentAnalysisRecord) => item.id)).toEqual(["b", "a"]);
    expect(promoteAnalysisHistory(current, "missing", storage)).toBe(current);
  });

  it("deletes one record and its associated image, persisting the remaining list", async () => {
    const current = [record("a"), record("b")];
    const storage = createStorage();

    expect(deleteAnalysisHistory(current, "a", storage)).toEqual([record("b")]);
    expect(deleteRecentImage).toHaveBeenCalledWith("a");
    await Promise.resolve();
    expect(JSON.parse(storage.read(HISTORY_STORAGE_KEY) ?? "[]")).toEqual([record("b")]);
  });

  it("keeps IndexedDB image cleanup best effort when the image is already missing", async () => {
    deleteRecentImage.mockRejectedValueOnce(new Error("Image not found"));

    expect(() => deleteAnalysisHistory([record("missing-image")], "missing-image", createStorage())).not.toThrow();
    await Promise.resolve();
  });

  it("propagates storage write failures so React state is not updated as if persistence succeeded", () => {
    const storage = createStorage();
    storage.setItem.mockImplementation(() => { throw new Error("Quota exceeded"); });

    expect(() => saveAnalysisHistory([], record("a"), storage)).toThrow("Quota exceeded");
  });
});
