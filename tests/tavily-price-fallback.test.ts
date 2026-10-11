import { afterEach, describe, expect, it, vi } from "vitest";

import { fixtureResult } from "../src/server/analysis/fixture-result";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { captureTavilyPriceFallback } from "../src/price/tavily-price-fallback";

afterEach(() => vi.unstubAllGlobals());

describe("Tavily fallback Browser access", () => {
  it("uses the supplied context to inspect results without opening its own Browser lease", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: "Listing", url: "https://shop.example/item" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const page = {
      async goto() {},
      async evaluate() { return { title: "Collectible listing", text: "¥12,000", structuredPrices: [] }; },
      async close() {},
    };
    const context = { newPage: vi.fn(async () => page) };
    const getBrowserContext = vi.fn(async () => context as never);
    const fixture = fixtureResult({ collectorMode: false });

    const snapshot = await captureTavilyPriceFallback({
      profile: toPriceItemProfile(fixture.identification),
      apiKey: "mock-key",
      maxResultsToOpen: 2,
      getBrowserContext,
    });

    expect(getBrowserContext).toHaveBeenCalledOnce();
    expect(context.newPage).toHaveBeenCalledOnce();
    expect(snapshot.results).toMatchObject([{ opened: true, extractedPrice: 12000 }]);
  });

  it("does not request a Browser context when the Tavily response has no usable pages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    const getBrowserContext = vi.fn();
    const fixture = fixtureResult({ collectorMode: false });

    const snapshot = await captureTavilyPriceFallback({
      profile: toPriceItemProfile(fixture.identification),
      apiKey: "mock-key",
      maxResultsToOpen: 2,
      getBrowserContext,
    });

    expect(snapshot.searchError).toMatch(/no usable HTTPS/);
    expect(getBrowserContext).not.toHaveBeenCalled();
  });
});