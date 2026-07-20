import { describe, expect, it } from "vitest";

import { daytonaStateMatchesNodeResult, type DaytonaPriceState } from "../src/daytona/price-processor";
import type { PriceReferenceResult } from "../src/price/types";

function nodeResult(): PriceReferenceResult {
  return {
    query: { itemName: "Test", versionOrPeriod: "unknown", priceSearchKeywordJa: "Test 中古", sources: [] },
    recommendedAreas: [],
    storeRecommendationDisclaimer: "Confirm before visiting.",
    samples: [{
      rank: 1,
      title: "Test used collectible",
      price: 12000,
      currency: "JPY",
      source: "Rakuten",
      url: "https://example.com/item",
      shopName: "Example",
      listingStatus: "active",
      condition: "used",
      versionMatch: "exact",
      packageStatus: "unknown",
      includedInReferenceRange: true,
      aggregationExclusionReason: null,
    }],
    observedRange: { currency: "JPY", min: 12000, max: 12000, sampleCount: 1 },
    referenceRange: { currency: "JPY", label: "Online asking-price reference", method: "median_absolute_deviation", low: 12000, median: 12000, high: 12000, sampleCount: 1 },
    referenceRangeBySource: [{ source: "Rakuten", low: 12000, median: 12000, high: 12000, sampleCount: 1 }],
    conditionRanges: [{ condition: "used", low: 12000, median: 12000, high: 12000, sampleCount: 1 }],
    warnings: [],
  };
}

function sandboxState(): DaytonaPriceState {
  return {
    version: 1,
    processorVersion: "daytona-price-mad-v1",
    sessionId: "test-session",
    processedAt: new Date(0).toISOString(),
    samples: [{ source: "Rakuten", rank: 1, url: "https://example.com/item", includedInReferenceRange: true, aggregationExclusionReason: null }],
    referenceRange: { low: 12000, median: 12000, high: 12000, sampleCount: 1 },
    referenceRangeBySource: [{ source: "Rakuten", low: 12000, median: 12000, high: 12000, sampleCount: 1 }],
    conditionRanges: [{ condition: "used", low: 12000, median: 12000, high: 12000, sampleCount: 1 }],
  };
}

describe("Daytona verification", () => {
  it("accepts an isolated recalculation that matches the Node result", () => {
    expect(daytonaStateMatchesNodeResult(sandboxState(), nodeResult())).toBe(true);
  });

  it("detects a different range without changing the Node result", () => {
    const result = nodeResult();
    const state = sandboxState();
    state.referenceRange.median = 9999;
    expect(daytonaStateMatchesNodeResult(state, result)).toBe(false);
    expect(result.referenceRange.median).toBe(12000);
  });
});
