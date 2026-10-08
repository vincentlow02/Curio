import { describe, expect, it, vi } from "vitest";
import { persistLocale, readStoredLocale } from "../src/features/analysis/services/locale-storage";
import { HISTORY_STORAGE_KEY, loadAnalysisHistory } from "../src/features/analysis/services/history-service";

function createLocaleStorage() {
  const values = new Map<string, string>([["qwen-collectible-recent-v1", "preserve-this-history"]]);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    read: (key: string) => values.get(key) ?? null,
  };
}

describe("locale storage isolation", () => {
  it("falls back when locale reads fail without deleting history", () => {
    const storage = createLocaleStorage();
    storage.getItem.mockImplementation(() => { throw new Error("Locale storage unavailable"); });

    expect(readStoredLocale(storage)).toBeNull();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.read("qwen-collectible-recent-v1")).toBe("preserve-this-history");
  });

  it("persists locale changes only under the locale key", () => {
    const storage = createLocaleStorage();

    persistLocale("ja", storage);

    expect(storage.setItem).toHaveBeenCalledWith("curio-ui-locale", "ja");
    expect(storage.read("qwen-collectible-recent-v1")).toBe("preserve-this-history");
  });

  it("keeps locale state usable when locale writes fail", () => {
    const storage = createLocaleStorage();
    storage.setItem.mockImplementation(() => { throw new Error("Locale storage unavailable"); });

    expect(() => persistLocale("zh", storage)).not.toThrow();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.read("qwen-collectible-recent-v1")).toBe("preserve-this-history");
  });

  it("does not couple history storage failures to locale reads", () => {
    const values = new Map<string, string>([
      ["curio-ui-locale", "zh"],
      [HISTORY_STORAGE_KEY, "{malformed"],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn((key: string) => { values.delete(key); }),
    };

    expect(loadAnalysisHistory(storage)).toEqual([]);
    expect(readStoredLocale(storage)).toBe("zh");
    expect(values.get("curio-ui-locale")).toBe("zh");
  });
});
