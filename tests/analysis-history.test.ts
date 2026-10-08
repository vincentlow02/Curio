import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentAnalysisRecord } from "../src/features/analysis/types";

const { deleteRecentImage, loadRecentImage, saveRecentImage } = vi.hoisted(() => ({
  deleteRecentImage: vi.fn(async (_id: string): Promise<void> => undefined),
  loadRecentImage: vi.fn(async (_id: string): Promise<File | null> => null),
  saveRecentImage: vi.fn(async (_id: string, _file: File): Promise<void> => undefined),
}));
vi.mock("../src/features/analysis/storage/recent-image-store", () => ({
  deleteRecentImage,
  loadRecentImage,
  saveRecentImage,
}));

import {
  deleteAnalysisImage,
  deleteAnalysisHistory,
  HISTORY_STORAGE_KEY,
  loadAnalysisImage,
  loadAnalysisHistory,
  promoteAnalysisHistory,
  readAnalysisHistory,
  saveAnalysisImage,
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
  beforeEach(() => {
    deleteRecentImage.mockClear();
    loadRecentImage.mockClear();
    saveRecentImage.mockClear();
  });

  it("persists and restores metadata through the existing key and record schema", () => {
    const storage = createStorage();
    const saved = saveAnalysisHistory([], record("stable-history-id"), storage);

    expect(saved.status).toBe("saved");
    expect(loadAnalysisHistory(storage)).toEqual(saved.records);
    expect(storage.read(HISTORY_STORAGE_KEY)).toBe(JSON.stringify([record("stable-history-id")]));
    expect(saved.records[0]?.id).toBe("stable-history-id");
  });

  it("routes image save, load, and delete through the history service", async () => {
    const file = new File(["image"], "collectible.png", { type: "image/png" });
    const restored = new File(["restored"], "collectible.png", { type: "image/png" });
    loadRecentImage.mockResolvedValueOnce(restored);

    await saveAnalysisImage("history-id", file);
    await expect(loadAnalysisImage("history-id")).resolves.toBe(restored);
    await deleteAnalysisImage("history-id");

    expect(saveRecentImage).toHaveBeenCalledWith("history-id", file);
    expect(loadRecentImage).toHaveBeenCalledWith("history-id");
    expect(deleteRecentImage).toHaveBeenCalledWith("history-id");
  });

  it("propagates image persistence failures for the existing callers to handle", async () => {
    saveRecentImage.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    loadRecentImage.mockRejectedValueOnce(new Error("IndexedDB unavailable"));

    await expect(saveAnalysisImage("history-id", new File([], "input.png"))).rejects.toThrow("IndexedDB unavailable");
    await expect(loadAnalysisImage("history-id")).rejects.toThrow("IndexedDB unavailable");
  });

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

  it("distinguishes an empty history from read failures and invalid stored JSON", () => {
    expect(readAnalysisHistory(createStorage())).toEqual({ status: "loaded", records: [] });
    expect(readAnalysisHistory(createStorage({ [HISTORY_STORAGE_KEY]: "{invalid" }))).toEqual({
      status: "unavailable",
      reason: "invalid-json",
    });
    const storage = createStorage();
    storage.getItem.mockImplementation(() => { throw new Error("Storage unavailable"); });
    expect(readAnalysisHistory(storage)).toEqual({ status: "unavailable", reason: "read-failed" });
  });

  it("preserves malformed stored JSON so it can be recovered later", () => {
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: "{invalid" });

    expect(loadAnalysisHistory(storage)).toEqual([]);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.read(HISTORY_STORAGE_KEY)).toBe("{invalid");

    const recoveredRecord = record("recovered");
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([recoveredRecord]));
    expect(loadAnalysisHistory(storage)).toEqual([recoveredRecord]);
  });

  it("preserves history after a storage read failure", () => {
    const original = JSON.stringify([record("preserved")]);
    const readFailure = createStorage({ [HISTORY_STORAGE_KEY]: original });
    readFailure.getItem.mockImplementation(() => { throw new Error("Storage unavailable"); });
    expect(loadAnalysisHistory(readFailure)).toEqual([]);
    expect(readFailure.removeItem).not.toHaveBeenCalled();
    expect(readFailure.read(HISTORY_STORAGE_KEY)).toBe(original);
  });

  it("allows saving a new record when the history storage contains a valid empty list", () => {
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: "[]" });

    const result = saveAnalysisHistory([], record("first"), storage);

    expect(result).toEqual({ records: [record("first")], status: "saved" });
    expect(JSON.parse(storage.read(HISTORY_STORAGE_KEY) ?? "null")).toEqual([record("first")]);
  });

  it("does not overwrite corrupt history when saving a new analysis", () => {
    const original = "{invalid";
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: original });

    const result = saveAnalysisHistory([], record("new-analysis"), storage);

    expect(result).toEqual({ records: [], status: "protected" });
    expect(storage.read(HISTORY_STORAGE_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("protects a transient read failure and saves from storage after reads recover", () => {
    const originalRecords = [record("existing")];
    const original = JSON.stringify(originalRecords);
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: original });
    storage.getItem.mockImplementationOnce(() => { throw new Error("Temporary storage failure"); });

    const blocked = saveAnalysisHistory([], record("new"), storage);
    expect(blocked).toEqual({ records: [], status: "protected" });
    expect(storage.read(HISTORY_STORAGE_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();

    const recovered = saveAnalysisHistory([], record("new"), storage);
    expect(recovered).toEqual({ records: [record("new"), ...originalRecords], status: "saved" });
    expect(JSON.parse(storage.read(HISTORY_STORAGE_KEY) ?? "null")).toEqual(recovered.records);
  });

  it("does not delete history metadata or images when storage cannot be read", () => {
    const original = "{invalid";
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: original });

    expect(deleteAnalysisHistory([record("image-record")], "image-record", storage).status).toBe("protected");
    expect(promoteAnalysisHistory([record("image-record")], "image-record", storage).status).toBe("protected");
    expect(saveAnalysisHistory([record("image-record")], record("new"), storage).status).toBe("protected");
    expect(storage.read(HISTORY_STORAGE_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(deleteRecentImage).not.toHaveBeenCalled();
  });

  it("prepends new records, updates existing records in place, and persists the same schema", () => {
    const original = [record("a"), record("b")];
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(original) });

    const inserted = saveAnalysisHistory(original, record("c"), storage);
    expect(inserted.records.map((item) => item.id)).toEqual(["c", "a", "b"]);

    const updated = saveAnalysisHistory(inserted.records, record("a", "Updated"), storage);
    expect(updated.records.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(updated.records[1]?.title).toBe("Updated");
    expect(JSON.parse(storage.read(HISTORY_STORAGE_KEY) ?? "[]")).toEqual(updated.records);
  });

  it("caps new history at twelve and deletes image data for records removed by the cap", () => {
    const original = Array.from({ length: 12 }, (_, index) => record(`run-${index}`));
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(original) });

    const next = saveAnalysisHistory(original, record("new"), storage);

    expect(next.records).toHaveLength(12);
    expect(next.records[0]?.id).toBe("new");
    expect(next.records.at(-1)?.id).toBe("run-10");
    expect(deleteRecentImage).toHaveBeenCalledWith("run-11");
  });

  it("promotes an existing record without changing its data or adding missing records", () => {
    const current = [record("a"), record("b")];
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(current) });

    const promoted = promoteAnalysisHistory(current, "b", storage);
    expect(promoted.records.map((item) => item.id)).toEqual(["b", "a"]);
    expect(JSON.parse(storage.read(HISTORY_STORAGE_KEY) ?? "[]").map((item: RecentAnalysisRecord) => item.id)).toEqual(["b", "a"]);
    expect(promoteAnalysisHistory(current, "missing", storage).records).toEqual(promoted.records);
  });

  it("deletes one record and its associated image, persisting the remaining list", async () => {
    const current = [record("a"), record("b")];
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(current) });

    expect(deleteAnalysisHistory(current, "a", storage).records).toEqual([record("b")]);
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

  it("does not delete image data when saving an over-limit history fails", () => {
    const records = Array.from({ length: 12 }, (_, index) => record(`run-${index}`));
    const storage = createStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(records) });
    storage.setItem.mockImplementation(() => { throw new Error("Quota exceeded"); });

    expect(() => saveAnalysisHistory(records, record("new"), storage)).toThrow("Quota exceeded");
    expect(deleteRecentImage).not.toHaveBeenCalled();
    expect(storage.read(HISTORY_STORAGE_KEY)).toBe(JSON.stringify(records));
  });
});
