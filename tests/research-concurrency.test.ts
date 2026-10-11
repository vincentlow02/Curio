import { describe, expect, it } from "vitest";

import { fixtureResult } from "../src/server/analysis/fixture-result";
import { coordinateMarketplaceSearches } from "../src/server/providers/marketplaces/coordinator";
import { captureAuctionSearches } from "../src/server/providers/auctions/capture-auctions";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";

describe("shared research browser context", () => {
  it("runs all Collector Mode pages concurrently and isolates one failed source", async () => {
    let active = 0;
    let maxActive = 0;
    const context = {
      async newPage() {
        return {
          async goto(url: string) {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 15));
            active -= 1;
            if (url.includes("search.rakuten.co.jp")) throw new Error("Rakuten unavailable");
          },
          async evaluate() { return []; },
          async waitForSelector() { throw new Error("No Mercari results"); },
          locator() { return { evaluateAll: async () => [] }; },
          async close() {},
        };
      },
    };
    const fixture = fixtureResult({ collectorMode: true });
    const settled = await Promise.allSettled([
      coordinateMarketplaceSearches({ getBrowserContext: async () => context as never, profile: toPriceItemProfile(fixture.identification), keyword: fixture.identification.priceSearchKeywordJa, maxCardsPerSource: 30 }),
      captureAuctionSearches({ context: context as never, identification: fixture.identification, collectorEvidence: fixture.collectorEvidence }),
    ]);
    expect(maxActive).toBe(4);
    expect(settled.every((entry) => entry.status === "fulfilled")).toBe(true);
    const marketplace = settled[0];
    if (marketplace?.status !== "fulfilled") throw new Error("Marketplace task unexpectedly rejected");
    expect(marketplace.value.snapshot.sources[0]).toMatchObject({ source: "Rakuten", candidates: [] });
    expect(marketplace.value.snapshot.sources[0]?.error).toMatch(/Rakuten unavailable/);
    expect(marketplace.value.snapshot.sources[1]).toMatchObject({ source: "Mercari", error: null, candidates: [] });
  });
});
