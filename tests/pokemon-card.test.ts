import { describe, expect, it } from "vitest";
import { buildPokemonCardSearchKeyword, matchPokemonCardIdentity } from "../src/core/profile/pokemon-card";
import { assertDetectionResult, detectionReviewReason, type DetectionResult, type PokemonCardIdentity } from "../src/core/profile/types";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { identityMatches } from "../src/price/identity";
import type { ItemProfile } from "../src/price/item-profile";
import { buildPriceResult } from "../src/price/matcher";
import type { SearchSnapshot } from "../src/price/types";

const pokemonCard: PokemonCardIdentity = {
  cardName: "リザードンex",
  cardNumber: "201/165",
  setCode: "SV2a",
  setName: "ポケモンカード151",
  rarity: "SAR",
  language: "Japanese",
  edition: "unknown",
  gradingCompany: "ungraded",
  grade: "unknown",
};

const detection: DetectionResult = {
  itemName: "リザードンex 201/165",
  version: "ポケモンカード151 SAR",
  priceSearchKeywordJa: buildPokemonCardSearchKeyword(pokemonCard),
  category: "Cards & Game Collectibles",
  pokemonCard,
};

describe("Pokémon Card detection contract", () => {
  it("accepts the optional Pokémon identity only in the card category", () => {
    expect(() => assertDetectionResult(detection)).not.toThrow();
    expect(() => assertDetectionResult({ ...detection, category: "Toys & Character Collectibles" })).toThrow(/only valid/);
  });

  it("requires a visible card number before research", () => {
    const missingNumber = { ...detection, pokemonCard: { ...pokemonCard, cardNumber: "unknown" } };
    expect(detectionReviewReason(missingNumber)).toMatch(/card number/i);
  });

  it("builds one exact Japanese marketplace keyword", () => {
    expect(buildPokemonCardSearchKeyword(pokemonCard)).toBe("リザードンex SV2a 201/165 SAR ポケモンカード 中古");
  });

  it("does not activate from a Pokémon character name alone", () => {
    const toy: DetectionResult = {
      itemName: "ポケットモンスター ピカチュウ ぬいぐるみ",
      version: "unknown",
      priceSearchKeywordJa: "ピカチュウ ぬいぐるみ 中古",
      category: "Toys & Character Collectibles",
    };
    expect(toPriceItemProfile(toy).pokemonCard).toBeUndefined();
  });
});

describe("Node-only price aggregation", () => {
  it("calculates Low, Typical, and High from MAD-filtered samples without an external processor", () => {
    const profile: ItemProfile = {
      itemName: "PSP-3000",
      brandCharacterSeries: "Sony",
      versionOrPeriod: "PSP-3000",
      color: "unknown",
      category: "Cards & Game Collectibles",
      subtype: "retro_games",
      searchKeywordsJa: ["PSP-3000 本体"],
      priceSearchKeywordJa: "PSP-3000 本体 中古",
      recommendedAreas: [],
      storeRecommendationDisclaimer: "No store inventory is guaranteed.",
      notes: [],
    };
    const candidate = (source: "Rakuten" | "Mercari", rank: number, price: number) => ({
      source,
      rank,
      title: `PSP-3000 本体 中古 ${rank}`,
      displayedPrice: price,
      url: `https://example.com/${source}/${rank}`,
      shopName: "seller",
      availabilityText: "",
    });
    const built = buildPriceResult({
      profile,
      snapshot: {
        version: 2,
        capturedAt: new Date(0).toISOString(),
        sources: [
          { source: "Rakuten", keyword: profile.priceSearchKeywordJa, searchUrl: "https://search.rakuten.co.jp/", error: null, candidates: [candidate("Rakuten", 1, 10_000), candidate("Rakuten", 2, 11_000), candidate("Rakuten", 3, 12_000)] },
          { source: "Mercari", keyword: profile.priceSearchKeywordJa, searchUrl: "https://jp.mercari.com/search", error: null, candidates: [candidate("Mercari", 1, 13_000), candidate("Mercari", 2, 14_000), candidate("Mercari", 3, 1_000_000)] },
        ],
      },
      tavilyFallback: { version: 1, provider: "Tavily", triggered: false, query: "", searchUrl: "", capturedAt: new Date(0).toISOString(), searchError: null, results: [], candidates: [], usage: null },
      storeSnapshot: { version: 1, enabled: false, query: "", searchUrl: "", capturedAt: new Date(0).toISOString(), error: null, stores: [] },
      maxCardsScannedPerSource: 30,
      maxSamplesPerSource: 5,
    });

    expect(built.result.observedRange).toMatchObject({ min: 10_000, max: 1_000_000, sampleCount: 6 });
    expect(built.result.referenceRange).toMatchObject({ low: 10_000, median: 12_000, high: 14_000, sampleCount: 5 });
    expect(built.result.samples.find((sample) => sample.price === 1_000_000)).toMatchObject({
      includedInReferenceRange: false,
      aggregationExclusionReason: "price_outlier",
    });
    expect(built.result.samples.filter((sample) => sample.includedInReferenceRange).map((sample) => sample.price))
      .toEqual([10_000, 11_000, 12_000, 13_000, 14_000]);
  });
});

describe("Pokémon Card exact listing matching", () => {
  it("accepts the exact card and rejects same-name cards with a different number", () => {
    expect(matchPokemonCardIdentity(pokemonCard, "ポケモンカード リザードンex SV2a 201/165 SAR 美品")).toBe("exact");
    expect(matchPokemonCardIdentity(pokemonCard, "ポケモンカード リザードンex SV2a 006/165 RR")).toBe("different");
  });

  it("keeps a same-name listing without a card number ambiguous", () => {
    expect(matchPokemonCardIdentity(pokemonCard, "ポケモンカード151 リザードンex SAR")).toBe("ambiguous");
  });

  it("separates graded and ungraded cards", () => {
    expect(matchPokemonCardIdentity(pokemonCard, "PSA10 リザードンex SV2a 201/165 SAR")).toBe("different");
    const psa10 = { ...pokemonCard, gradingCompany: "PSA" as const, grade: "10" };
    expect(matchPokemonCardIdentity(psa10, "PSA10 リザードンex SV2a 201/165 SAR")).toBe("exact");
    expect(matchPokemonCardIdentity(psa10, "リザードンex SV2a 201/165 SAR")).toBe("different");
  });

  it("routes the legacy matcher through the strict Pokémon branch", () => {
    const profile = toPriceItemProfile(detection);
    expect(identityMatches(profile, "リザードンex SV2a 201/165 SAR")).toBe(true);
    expect(identityMatches(profile, "リザードンex SV2a 006/165 RR")).toBe(false);
  });

  it("includes only exact cards in the marketplace price reference", () => {
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
            { source: "Mercari", rank: 1, title: "リザードンex SV2a 201/165 SAR", displayedPrice: 25000, url: "https://jp.mercari.com/item/exact", shopName: "individual_seller", availabilityText: "" },
            { source: "Mercari", rank: 2, title: "リザードンex SV2a 006/165 RR", displayedPrice: 500, url: "https://jp.mercari.com/item/different", shopName: "individual_seller", availabilityText: "" },
            { source: "Mercari", rank: 3, title: "リザードンex SAR ポケモンカード151", displayedPrice: 12000, url: "https://jp.mercari.com/item/ambiguous", shopName: "individual_seller", availabilityText: "" },
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

    expect(built.result.samples.map((sample) => sample.url)).toEqual(["https://jp.mercari.com/item/exact"]);
    expect(built.excluded).toContainEqual(expect.objectContaining({ url: "https://jp.mercari.com/item/different", reason: "different_model" }));
    expect(built.excluded).toContainEqual(expect.objectContaining({ url: "https://jp.mercari.com/item/ambiguous", reason: "unconfirmed_card_identity" }));
  });
});
