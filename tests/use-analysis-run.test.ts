import { describe, expect, it } from "vitest";
import { createAnalysisSession, updatePokemonCardDraft, updateRecognitionDraft } from "../src/features/analysis/hooks/use-analysis-run";
import type { PendingInput } from "../src/features/analysis/types";

const input: PendingInput = {
  file: null,
  text: "Vintage figure",
  category: "Toys & Character Collectibles",
  collectorMode: true,
};

describe("analysis run workflow", () => {
  it("translates a recognized API response into the current confirmation state", () => {
    const identification = {
      itemName: "Vintage figure",
      version: "First release",
      priceSearchKeywordJa: "ヴィンテージ フィギュア",
      category: "Toys & Character Collectibles",
    } as const;

    const result = createAnalysisSession({
      runId: "run-id",
      status: "identified",
      identification,
      createdAt: "2026-10-08T00:00:00.000Z",
    }, input, "fallback-time");

    expect(result).toEqual({
      id: "run-id",
      session: {
        id: "run-id",
        status: "identified",
        queuePosition: null,
        progress: 32,
        message: "Identification complete. Review the fields before continuing.",
        identification,
        collectorMode: true,
        collectorEvidence: null,
        toolActivity: [],
        createdAt: "2026-10-08T00:00:00.000Z",
        updatedAt: "2026-10-08T00:00:00.000Z",
        result: null,
        error: null,
      },
    });
  });

  it("supports the legacy sessionId response and uses input/default values", () => {
    const result = createAnalysisSession({
      sessionId: "legacy-id",
      status: "needs_review",
      collectorMode: false,
      error: "More details are needed.",
    }, input, "fallback-time");

    expect(result.id).toBe("legacy-id");
    expect(result.session).toMatchObject({
      status: "needs_review",
      progress: 100,
      message: "More identification details are needed",
      collectorMode: false,
      createdAt: "fallback-time",
      updatedAt: "fallback-time",
      error: "More details are needed.",
      toolActivity: [],
    });
  });

  it("rejects an API response without the identifiers and status needed by the workflow", () => {
    expect(() => createAnalysisSession({ error: "Unexpected response." }, input, "fallback-time"))
      .toThrow("Unexpected response.");
  });

  it("removes card-specific recognition data when the confirmed category changes", () => {
    const recognition = {
      itemName: "Trading card",
      version: "First edition",
      priceSearchKeywordJa: "カード",
      category: "Cards & Game Collectibles" as const,
      pokemonCard: {
        cardName: "Card",
        cardNumber: "001",
        setCode: "SET",
        setName: "Set",
        rarity: "Rare",
        language: "Japanese" as const,
        edition: "1st",
        gradingCompany: "ungraded" as const,
        grade: "N/A",
      },
    };

    expect(updateRecognitionDraft(recognition, "category", "Toys & Character Collectibles")).toEqual({
      itemName: "Trading card",
      version: "First edition",
      priceSearchKeywordJa: "カード",
      category: "Toys & Character Collectibles",
    });
  });

  it("rebuilds the Pokémon card search keyword when confirmed card identity changes", () => {
    const recognition = {
      itemName: "Trading card",
      version: "First edition",
      priceSearchKeywordJa: "old keyword",
      category: "Cards & Game Collectibles" as const,
      pokemonCard: {
        cardName: "Card",
        cardNumber: "001",
        setCode: "SET",
        setName: "Set",
        rarity: "Rare",
        language: "Japanese" as const,
        edition: "1st",
        gradingCompany: "ungraded" as const,
        grade: "N/A",
      },
    };

    const updated = updatePokemonCardDraft(recognition, "cardNumber", "002");

    expect(updated?.pokemonCard?.cardNumber).toBe("002");
    expect(updated?.priceSearchKeywordJa).not.toBe("old keyword");
  });
});
