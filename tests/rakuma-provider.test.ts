import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { MARKETPLACE_IDS } from "../src/core/marketplace";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { fixtureResult } from "../src/server/analysis/fixture-result";
import { buildPriceResult } from "../src/price/matcher";
import { disabledStoreSnapshot } from "../src/price/store-verifier";
import { disabledTavilyFallback } from "../src/price/tavily-price-fallback";
import { ResearchCostTracker } from "../src/server/analysis/marketplace-cost-tracker";
import { parseRakumaSearchPage, rakumaProvider } from "../src/server/providers/marketplaces/rakuma";

const fixture = new URL("../fixtures/rakuma/search-results.html", import.meta.url);

describe("Rakuma provider", () => {
  it("does not issue HTTP requests when Rakuma authorization is unverified", async () => {
    const originalFetch = globalThis.fetch;
    const originalAuthorization = process.env.RAKUMA_DATA_LICENSE_VERIFIED;
    let fetchCalls = 0;
    let requestHookCalls = 0;
    delete process.env.RAKUMA_DATA_LICENSE_VERIFIED;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("Unexpected network request");
    };

    try {
      const result = await rakumaProvider.search({
        profile: {} as never,
        keyword: "PSP-3000",
        maxCards: 30,
        onRequest: () => { requestHookCalls += 1; },
      });

      expect(fetchCalls).toBe(0);
      expect(requestHookCalls).toBe(0);
      expect(result.error).toContain("authorization is not verified");
      expect(result.candidates).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalAuthorization === undefined) delete process.env.RAKUMA_DATA_LICENSE_VERIFIED;
      else process.env.RAKUMA_DATA_LICENSE_VERIFIED = originalAuthorization;
    }
  });

  it("extracts same-card titles, prices and item URLs and excludes sold-out/recommendations", async () => {
    const html = await readFile(fixture, "utf8");
    const result = parseRakumaSearchPage(html, "PSP-3000", 30);

    expect(result.itemBoxCount).toBe(3);
    expect(result.soldOutCount).toBe(1);
    expect(result.candidates).toEqual([
      {
        source: MARKETPLACE_IDS.rakuma,
        rank: 1,
        title: "PSP-3000 fixture listing one",
        displayedPrice: 15800,
        url: "https://item.fril.jp/10000000000000000000000000000001",
        shopName: "unknown",
        availabilityText: "",
        listingCondition: "unknown",
      },
      {
        source: MARKETPLACE_IDS.rakuma,
        rank: 2,
        title: "PSP-3000 fixture listing two",
        displayedPrice: 6600,
        url: "https://item.fril.jp/10000000000000000000000000000002",
        shopName: "unknown",
        availabilityText: "",
        listingCondition: "unknown",
      },
    ]);
    expect(parseRakumaSearchPage(html, "Nintendo Switch").candidates).toEqual([]);
  });

  it("makes one HTTP GET and connects request/candidate metrics", async () => {
    const originalFetch = globalThis.fetch;
    const originalAuthorization = process.env.RAKUMA_DATA_LICENSE_VERIFIED;
    const html = await readFile(fixture, "utf8");
    let fetchCalls = 0;
    const tracker = new ResearchCostTracker("rakuma-provider-test", { httpCostPerRequestUSD: {} });
    const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.rakuma, "http");
    process.env.RAKUMA_DATA_LICENSE_VERIFIED = "true";
    globalThis.fetch = async (input, init) => {
      fetchCalls += 1;
      expect(new URL(String(input)).href).toBe("https://fril.jp/s?query=PSP-3000");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    };

    try {
      const result = await rakumaProvider.search({
        profile: {} as never,
        keyword: "PSP-3000",
        maxCards: 30,
        onRequest: () => undefined,
        onHttpRequestStarted: () => meter.requestStarted(true),
        onHttpRequestCompleted: (status, elapsed, blockingRelevant) => meter.requestCompleted(status, elapsed, blockingRelevant),
      });
      meter.finish({ candidates: result.candidates, error: result.error });
      const metric = tracker.settleBrowserSession(null).find((record) => record.kind === "provider_metric");
      const profile = toPriceItemProfile(fixtureResult().identification);
      const priced = buildPriceResult({
        profile,
        snapshot: { version: 2, capturedAt: "fixture", sources: [result] },
        tavilyFallback: disabledTavilyFallback(profile),
        storeSnapshot: disabledStoreSnapshot(),
        maxCardsScannedPerSource: 30,
        maxSamplesPerSource: 5,
      });

      expect(fetchCalls).toBe(1);
      expect(result.candidates).toHaveLength(2);
      expect(metric).toMatchObject({ providerId: MARKETPLACE_IDS.rakuma, httpRequestCount: 1, apiRequestCount: 1, candidateCount: 2, browserPageCount: 0, estimatedBrowserlessUnits: null, estimatedCostUSD: null, actualCostUSD: null, costStatus: "UNKNOWN" });
      expect(priced.result.samples.map(({ title, price, currency, url, condition, includedInReferenceRange, aggregationExclusionReason }) => ({ title, price, currency, url, condition, includedInReferenceRange, aggregationExclusionReason }))).toEqual([
        { title: "PSP-3000 fixture listing one", price: 15800, currency: "JPY", url: "https://item.fril.jp/10000000000000000000000000000001", condition: "unknown", includedInReferenceRange: false, aggregationExclusionReason: "unknown_condition" },
        { title: "PSP-3000 fixture listing two", price: 6600, currency: "JPY", url: "https://item.fril.jp/10000000000000000000000000000002", condition: "unknown", includedInReferenceRange: false, aggregationExclusionReason: "unknown_condition" },
      ]);
      expect(priced.result.observedRange).toMatchObject({ min: 6600, max: 15800, sampleCount: 2 });
      expect(priced.result.referenceRange).toMatchObject({ low: null, median: null, high: null, sampleCount: 0 });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalAuthorization === undefined) delete process.env.RAKUMA_DATA_LICENSE_VERIFIED;
      else process.env.RAKUMA_DATA_LICENSE_VERIFIED = originalAuthorization;
    }
  });
});