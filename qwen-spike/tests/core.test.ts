import { describe, expect, it } from "vitest";
import { assertDetectionResult, COLLECTIBLE_CATEGORIES } from "../src/core/profile/types";
import { assertSafeRecommendations, FORBIDDEN_INVENTORY, recommendAreas, verifiedStoreSuggestions } from "../src/core/recommendation/recommend";

describe("public detection contract", () => {
  it("accepts every supported category", () => {
    for (const category of COLLECTIBLE_CATEGORIES) expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category })).not.toThrow();
  });
  it("rejects unknown and extra fields", () => {
    expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category: "unknown" })).toThrow();
    expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category: COLLECTIBLE_CATEGORIES[0], subtype: "toys_character" })).toThrow(/额外字段/);
  });
});

describe("grounded recommendations", () => {
  it("provides deterministic areas for all categories", () => {
    for (const category of COLLECTIBLE_CATEGORIES) expect(recommendAreas(category)).toHaveLength(2);
  });
  it("keeps only sourced HTTPS stores", () => {
    const stores = verifiedStoreSuggestions([{ name: "Verified", sourceUrl: "https://example.com/store" }, { name: "Unsafe", sourceUrl: "http://example.com" }]);
    expect(stores).toHaveLength(1);
    expect(() => assertSafeRecommendations([], stores)).not.toThrow();
  });
  it("blocks inventory claims", () => {
    expect(FORBIDDEN_INVENTORY.test("available now")).toBe(true);
    expect(() => assertSafeRecommendations([{ area: "東京", reason: "当前有货", searchKeywordJa: "x" }], [])).toThrow();
  });
});
