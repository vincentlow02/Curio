import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { MARKETPLACE_IDS } from "../src/core/marketplace";
import { fixtureResult } from "../src/server/analysis/fixture-result";
import { ResearchCostTracker } from "../src/server/analysis/marketplace-cost-tracker";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { yahooFurimaProvider, parseYahooFurimaSearchPage } from "../src/server/providers/marketplaces/yahoo-furima";

const nextDataFixture = new URL("../fixtures/yahoo-furima/search-next-data.html", import.meta.url);
const htmlFallbackFixture = new URL("../fixtures/yahoo-furima/search-html-fallback.html", import.meta.url);

describe("Yahoo!フリマ provider", () => {
  it("parses query-bound NEXT_DATA listings and ignores recommendations", async () => {
    const html = await readFile(nextDataFixture, "utf8");
    const parsed = parseYahooFurimaSearchPage(html, "PSP-3000", 3);

    expect(parsed.extraction).toBe("next_data");
    expect(parsed.candidates).toEqual([{
      source: MARKETPLACE_IDS.yahooFurima,
      rank: 1,
      title: "Sony PSP-3000 fixture listing",
      displayedPrice: 12800,
      url: "https://paypayfleamarket.yahoo.co.jp/item/zfixture1001",
      shopName: "unknown",
      availabilityText: "",
    }]);
  });

  it("uses HTML from the same page response when NEXT_DATA is absent", async () => {
    const html = await readFile(htmlFallbackFixture, "utf8");
    const parsed = parseYahooFurimaSearchPage(html, "PSP-3000", 3);

    expect(parsed.extraction).toBe("html");
    expect(parsed.candidates.map(({ title, displayedPrice, url }) => ({ title, displayedPrice, url }))).toEqual([{
      title: "Sony PSP-3000 image-alt fixture",
      displayedPrice: 14200,
      url: "https://paypayfleamarket.yahoo.co.jp/item/zfixture1002",
    }]);
  });

  it("does not parse listings when the page search query differs", async () => {
    const html = await readFile(nextDataFixture, "utf8");
    const parsed = parseYahooFurimaSearchPage(html, "Nintendo Switch", 3);

    expect(parsed).toEqual({ candidates: [], extraction: "none" });
  });

  it("makes one HTTP GET, records its metrics, and leaves Browserless usage empty", async () => {
    const originalFetch = globalThis.fetch;
    const originalAuthorization = process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED;
    const html = await readFile(nextDataFixture, "utf8");
    let fetchCalls = 0;
    let requestHookCalls = 0;
    const completedRequests: Array<{ status: number | null; blockingRelevant?: boolean }> = [];
    process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED = "true";
    globalThis.fetch = async (input, init) => {
      fetchCalls += 1;
      expect(new URL(String(input)).href).toBe("https://paypayfleamarket.yahoo.co.jp/search/PSP-3000");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    };

    try {
      const tracker = new ResearchCostTracker("yahoo-furima-fixture", {
        httpCostPerRequestUSD: {},
      });
      const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.yahooFurima, "http");
      const result = await yahooFurimaProvider.search({
        profile: toPriceItemProfile(fixtureResult({ collectorMode: false }).identification),
        keyword: "PSP-3000",
        maxCards: 3,
        onRequest: () => { requestHookCalls += 1; },
        onHttpRequestStarted: () => meter.requestStarted(true),
        onHttpRequestCompleted: (status, elapsedMs, blockingRelevant) => {
          meter.requestCompleted(status, elapsedMs, blockingRelevant);
          completedRequests.push({ status, blockingRelevant });
        },
      });
      meter.finish({ candidates: result.candidates, error: result.error });
      const metric = tracker.settleBrowserSession(null).find((record) => record.kind === "provider_metric");

      expect(fetchCalls).toBe(1);
      expect(requestHookCalls).toBe(1);
      expect(completedRequests).toEqual([{ status: 200, blockingRelevant: true }]);
      expect(result.candidates).toHaveLength(1);
      expect(metric).toMatchObject({
        providerId: MARKETPLACE_IDS.yahooFurima,
        httpRequestCount: 1,
        apiRequestCount: 1,
        candidateCount: 1,
        browserPageCount: 0,
        estimatedBrowserlessUnits: null,
        estimatedCostUSD: null,
        actualCostUSD: null,
        costStatus: "UNKNOWN",
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalAuthorization === undefined) delete process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED;
      else process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED = originalAuthorization;
    }
  });

  it("does not register the provider unless data-use authorization is verified", async () => {
    const originalAuthorization = process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED;
    delete process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED;
    try {
      const { marketplaceRegistry } = await import("../src/server/providers/marketplaces/registry");
      expect(marketplaceRegistry.find(({ id }) => id === MARKETPLACE_IDS.yahooFurima)).toMatchObject({ status: "disabled" });
    } finally {
      if (originalAuthorization === undefined) delete process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED;
      else process.env.YAHOO_FURIMA_DATA_LICENSE_VERIFIED = originalAuthorization;
    }
  });
});