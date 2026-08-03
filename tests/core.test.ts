import { describe, expect, it } from "vitest";
import { assertDetectionResult, COLLECTIBLE_CATEGORIES, detectionReviewReason } from "../src/core/profile/types";
import { assertSafeRecommendations, FORBIDDEN_INVENTORY, recommendAreas, verifiedStoreSuggestions } from "../src/core/recommendation/recommend";
import { identityMatches } from "../src/price/identity";
import { buildMarketplaceKeyword, buildMercariKeyword } from "../src/price/marketplace-browser";
import { buildTavilyPriceQuery } from "../src/price/tavily-price-fallback";
import { STORE_DISCLAIMER, type ItemProfile } from "../src/profile/types";

describe("public detection contract", () => {
  it("accepts every supported category", () => {
    for (const category of COLLECTIBLE_CATEGORIES) expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category })).not.toThrow();
  });
  it("rejects unknown and extra fields", () => {
    expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category: "unknown" })).toThrow();
    expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category: COLLECTIBLE_CATEGORIES[0], subtype: "toys_character" })).toThrow(/extra fields/);
  });
  it("rejects an ambiguous single cover word as a music identity", () => {
    expect(detectionReviewReason({ itemName: "MINE", version: "unknown", priceSearchKeywordJa: "MINE 中古", category: "Records & Music Collectibles" })).not.toBeNull();
    expect(detectionReviewReason({ itemName: "山下達郎 FOR YOU LP", version: "1982", priceSearchKeywordJa: "山下達郎 FOR YOU LP 中古", category: "Records & Music Collectibles" })).toBeNull();
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

describe("rare record marketplace search", () => {
  const profile: ItemProfile = {
    itemName: "峰厚介五重奏 MINE",
    brandCharacterSeries: "unknown",
    versionOrPeriod: "LP",
    color: "unknown",
    category: "Records & Music Collectibles",
    subtype: "records_vinyl",
    searchKeywordsJa: ["峰厚介五重奏 MINE 中古"],
    priceSearchKeywordJa: "峰厚介五重奏 MINE 中古",
    recommendedAreas: [],
    storeRecommendationDisclaimer: STORE_DISCLAIMER,
    notes: [],
  };

  it("uses a broader single marketplace query without adding a second search", () => {
    expect(buildMarketplaceKeyword(profile.priceSearchKeywordJa)).toBe("峰厚介 MINE 中古");
    expect(buildMercariKeyword(profile.priceSearchKeywordJa)).toBe("峰厚介 MINE");
    expect(buildTavilyPriceQuery(profile)).toBe("峰厚介 MINE LP 中古 価格");
  });

  it("matches artist plus title but rejects unrelated MINE products", () => {
    expect(identityMatches(profile, "【中古 LP】峰厚介 MINE 和ジャズ レコード")).toBe(true);
    expect(identityMatches(profile, "【中古 LP】MINE 森山犬 原画集")).toBe(false);
    expect(identityMatches(profile, "MINE LP レコード")).toBe(false);
  });
});
