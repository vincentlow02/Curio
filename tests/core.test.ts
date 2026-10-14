import { describe, expect, it } from "vitest";
import { assertDetectionResult, COLLECTIBLE_CATEGORIES, detectionReviewReason, type DetectionResult } from "../src/core/profile/types";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { assertSafeRecommendations, FORBIDDEN_INVENTORY, recommendAreas, verifiedStoreSuggestions } from "../src/core/recommendation/recommend";
import { identityMatches } from "../src/price/identity";
import { buildMarketplaceKeyword } from "../src/server/providers/marketplaces/shared/keyword";
import { buildMercariKeyword } from "../src/server/providers/marketplaces/mercari";
import { buildTavilyPriceQuery } from "../src/price/tavily-price-fallback";
import { STORE_DISCLAIMER, type ItemProfile } from "../src/price/item-profile";
import { buildPriceResult } from "../src/price/matcher";
import type { SearchSnapshot } from "../src/price/types";

describe("public detection contract", () => {
  it("accepts every supported category", () => {
    for (const category of COLLECTIBLE_CATEGORIES) expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category })).not.toThrow();
  });
  it("rejects unknown and extra fields", () => {
    expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category: "unknown" })).toThrow();
    expect(() => assertDetectionResult({ itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category: COLLECTIBLE_CATEGORIES[0], subtype: "toys_character" })).toThrow(/extra fields/);
  });
  it("accepts a supported product type and rejects an invalid one", () => {
    const result = { itemName: "Test", version: "unknown", priceSearchKeywordJa: "Test 中古", category: COLLECTIBLE_CATEGORIES[0] };
    expect(() => assertDetectionResult({ ...result, productType: "figure" })).not.toThrow();
    expect(() => assertDetectionResult({ ...result, productType: "invalid" })).toThrow(/productType/);
  });
  it("rejects an ambiguous single cover word as a music identity", () => {
    expect(detectionReviewReason({ itemName: "MINE", version: "unknown", priceSearchKeywordJa: "MINE 中古", category: "Records & Music Collectibles" })).not.toBeNull();
    expect(detectionReviewReason({ itemName: "山下達郎 FOR YOU LP", version: "1982", priceSearchKeywordJa: "山下達郎 FOR YOU LP 中古", category: "Records & Music Collectibles" })).toBeNull();
  });
});

describe("product type marketplace matching", () => {
  it("rejects a game guide and empty case while keeping the game and software-only listing", () => {
    const detection: DetectionResult = {
      itemName: "ポポロクロイス牧場物語",
      version: "Nintendo 3DS",
      productType: "game_software",
      priceSearchKeywordJa: "ポポロクロイス牧場物語 Nintendo 3DS ゲームソフト 中古",
      category: "Cards & Game Collectibles",
    };
    const candidate = (rank: number, title: string, price: number) => ({
      source: "Mercari" as const,
      rank,
      title,
      displayedPrice: price,
      url: `https://example.com/${rank}`,
      shopName: "seller",
      availabilityText: "",
    });
    const snapshot: SearchSnapshot = {
      version: 2,
      capturedAt: new Date(0).toISOString(),
      sources: [
        {
          source: "Mercari",
          keyword: detection.priceSearchKeywordJa,
          searchUrl: "https://jp.mercari.com/search",
          error: null,
          candidates: [
            candidate(1, "ポポロクロイス牧場物語 Nintendo 3DS ゲームソフト", 3200),
            candidate(2, "ポポロクロイス牧場物語 3DS ソフトのみ", 1800),
            candidate(3, "ポポロクロイス牧場物語 公式パーフェクトガイド 攻略本", 900),
            candidate(4, "ポポロクロイス牧場物語 3DS ケースのみ", 500),
            candidate(5, "ポポロクロイス牧場物語 アクリルスタンド", 1200),
          ],
        },
        { source: "Rakuten", keyword: detection.priceSearchKeywordJa, searchUrl: "https://search.rakuten.co.jp/", error: null, candidates: [] },
      ],
    };
    const built = buildPriceResult({
      profile: toPriceItemProfile(detection),
      snapshot,
      tavilyFallback: { version: 1, provider: "Tavily", triggered: false, query: "", searchUrl: "", capturedAt: new Date(0).toISOString(), searchError: null, results: [], candidates: [], usage: null },
      storeSnapshot: { version: 1, enabled: false, query: "", searchUrl: "", capturedAt: new Date(0).toISOString(), error: null, stores: [] },
      maxCardsScannedPerSource: 30,
      maxSamplesPerSource: 5,
    });

    expect(built.result.samples.map((sample) => sample.title)).toEqual([
      "ポポロクロイス牧場物語 Nintendo 3DS ゲームソフト",
      "ポポロクロイス牧場物語 3DS ソフトのみ",
    ]);
    expect(built.result.samples[1]?.packageStatus).toBe("without_box");
    expect(built.excluded).toContainEqual(expect.objectContaining({ rank: 3, reason: "different_product_type" }));
    expect(built.excluded).toContainEqual(expect.objectContaining({ rank: 4, reason: "different_product_type" }));
    expect(built.excluded).toContainEqual(expect.objectContaining({ rank: 5, reason: "different_product_type" }));
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
