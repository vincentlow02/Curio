import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceReferenceResult } from "../src/price/types";

const daytonaMock = vi.hoisted(() => ({
  mode: "verified" as "verified" | "mismatch" | "failure",
  deleteSandbox: vi.fn(async () => {}),
}));

vi.mock("@daytona/sdk", () => ({
  Daytona: class {
    constructor(_config: unknown) {}

    async create(options: { labels?: Record<string, string> }) {
      const sessionId = options.labels?.session ?? "missing";
      const state = {
        version: 1,
        processorVersion: "daytona-price-mad-v1",
        sessionId,
        processedAt: new Date(0).toISOString(),
        samples: [{
          source: "Rakuten",
          rank: 1,
          url: "https://example.com/item",
          includedInReferenceRange: true,
          aggregationExclusionReason: null,
        }],
        referenceRange: { low: 12000, median: daytonaMock.mode === "mismatch" ? 9999 : 12000, high: 12000, sampleCount: 1 },
        referenceRangeBySource: [{ source: "Rakuten", low: 12000, median: 12000, high: 12000, sampleCount: 1 }],
        conditionRanges: [{ condition: "used", low: 12000, median: 12000, high: 12000, sampleCount: 1 }],
      };
      return {
        id: "sandbox-test",
        process: {
          codeRun: async () => {
            if (daytonaMock.mode === "failure") throw new Error("provider failed with secret details");
            return { exitCode: 0, result: `DAYTONA_PRICE_STATE=${JSON.stringify(state)}\n` };
          },
        },
        delete: daytonaMock.deleteSandbox,
      };
    }

    async [Symbol.asyncDispose](): Promise<void> {}
  },
}));

import { processPriceResultWithDaytona } from "../src/daytona/price-processor";

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

function options() {
  return {
    enabled: true,
    sessionId: "cleanup-test",
    apiKey: "test-key",
    apiUrl: "https://app.daytona.io/api",
    target: undefined,
    createTimeoutSeconds: 60,
    executionTimeoutSeconds: 30,
    stateTtlHours: 168,
  };
}

describe("Daytona sandbox cleanup", () => {
  beforeEach(() => {
    daytonaMock.mode = "verified";
    daytonaMock.deleteSandbox.mockClear();
  });

  it("deletes the sandbox after successful verification", async () => {
    const processed = await processPriceResultWithDaytona(nodeResult(), options());
    expect(processed.report.verificationStatus).toBe("verified");
    expect(daytonaMock.deleteSandbox).toHaveBeenCalledOnce();
  });

  it("deletes the sandbox after a verification mismatch", async () => {
    daytonaMock.mode = "mismatch";
    const result = nodeResult();
    const processed = await processPriceResultWithDaytona(result, options());
    expect(processed.report.verificationStatus).toBe("mismatch");
    expect(result.referenceRange.median).toBe(12000);
    expect(daytonaMock.deleteSandbox).toHaveBeenCalledOnce();
  });

  it("deletes the sandbox when sandbox execution fails", async () => {
    daytonaMock.mode = "failure";
    const processed = await processPriceResultWithDaytona(nodeResult(), options());
    expect(processed.report.verificationStatus).toBe("unavailable");
    expect(processed.report.nodeResultRetained).toBe(true);
    expect(daytonaMock.deleteSandbox).toHaveBeenCalledOnce();
  });
});
