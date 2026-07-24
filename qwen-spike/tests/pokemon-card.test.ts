import { describe, expect, it } from "vitest";
import { buildPokemonCardSearchKeyword, matchPokemonCardIdentity } from "../src/core/profile/pokemon-card";
import { assertDetectionResult, detectionReviewReason, type DetectionResult, type PokemonCardIdentity } from "../src/core/profile/types";
import { toLegacyItemProfile } from "../src/core/profile/legacy-adapter";
import { identityMatches } from "../src/price/identity";
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
    expect(toLegacyItemProfile(toy).pokemonCard).toBeUndefined();
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
    const profile = toLegacyItemProfile(detection);
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
      profile: toLegacyItemProfile(detection),
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
