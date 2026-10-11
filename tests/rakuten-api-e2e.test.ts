import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const e2eMocks = vi.hoisted(() => ({ openBrowser: vi.fn() }));
vi.mock("../src/server/browser/browser-provider", () => ({ browserProvider: { open: e2eMocks.openBrowser } }));

import { buildPokemonCardSearchKeyword } from "../src/core/profile/pokemon-card";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import type { DetectionResult, PokemonCardIdentity } from "../src/core/profile/types";
import { buildPriceResult } from "../src/price/matcher";
import { disabledTavilyFallback } from "../src/price/tavily-price-fallback";
import { disabledStoreSnapshot } from "../src/price/store-verifier";
import type { RakutenApiItem } from "../src/server/providers/marketplaces/rakuten-api-client";
import { validateResearchStreamEvent } from "../src/features/analysis/services/research-stream";

const previousEnv = {
  apiEnabled: process.env.RAKUTEN_OFFICIAL_API_ENABLED,
  applicationId: process.env.RAKUTEN_APPLICATION_ID,
  accessKey: process.env.RAKUTEN_ACCESS_KEY,
  fixtureMode: process.env.WEB_USE_FIXTURE,
  tavilyEnabled: process.env.ENABLE_TAVILY_PRICE_FALLBACK,
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function rakutenItems(): RakutenApiItem[] {
  return [
    {
      itemName: "リザードンex SV2a 201/165 SAR 日本語版 中古 箱付き",
      itemCode: "shop:exact",
      itemPrice: 10_000,
      itemUrl: "https://item.rakuten.co.jp/shop/exact",
      availability: 1,
      shopName: "Card Shop A",
    },
    {
      itemName: "リザードンex SV2a 201/165 SAR 英語版 English Version 中古",
      itemCode: "shop:edition",
      itemPrice: 9_000,
      itemUrl: "https://item.rakuten.co.jp/shop/edition",
      availability: 1,
      shopName: "Card Shop B",
    },
    {
      itemName: "リザードンex SV2a 201/165 SAR 日本語版 中古 箱なし",
      itemCode: "shop:no-box",
      itemPrice: 12_000,
      itemUrl: "https://item.rakuten.co.jp/shop/no-box",
      availability: 1,
      shopName: "Card Shop C",
    },
    {
      itemName: "リザードンex SV2a 201/165 SAR 日本語版 中古",
      itemCode: "shop:no-price",
      itemPrice: null,
      itemUrl: "https://item.rakuten.co.jp/shop/no-price",
      availability: 1,
      shopName: "Card Shop D",
    },
    {
      itemName: "リザードンex SV2a 201/165 SAR 日本語版 中古",
      itemCode: "shop:unavailable",
      itemPrice: 15_000,
      itemUrl: "https://item.rakuten.co.jp/shop/unavailable",
      availability: 0,
      shopName: "Card Shop E",
    },
    {
      itemName: "リザードンex SV2a 201/165 SAR 日本語版 中古 箱付き",
      itemCode: "shop:duplicate",
      itemPrice: 10_000,
      itemUrl: "https://item.rakuten.co.jp/shop/duplicate",
      availability: 1,
      shopName: "Card Shop F",
    },
  ];
}

function identification(): DetectionResult {
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
  return {
    itemName: "リザードンex 201/165",
    version: "ポケモンカード151 SAR",
    priceSearchKeywordJa: buildPokemonCardSearchKeyword(pokemonCard),
    category: "Cards & Game Collectibles",
    pokemonCard,
  };
}

function browserContext(metrics: { pages: string[]; pageClosed: number }): { newPage(): Promise<unknown> } {
  return {
    async newPage() {
      return {
        async goto(url: string) { metrics.pages.push(url); },
        async waitForSelector() { await wait(35); },
        async evaluate() {
          return [{
            source: "Mercari",
            rank: 1,
            title: "リザードンex SV2a 201/165 SAR 日本語版 中古",
            displayedPrice: 11_000,
            url: "https://jp.mercari.com/item/mercari-exact",
            shopName: "individual_seller",
            availabilityText: "",
          }];
        },
        async close() { metrics.pageClosed += 1; },
      };
    },
  };
}

function apiResponse(): Response {
  return new Response(JSON.stringify({ items: rakutenItems() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.RAKUTEN_OFFICIAL_API_ENABLED = "true";
  process.env.RAKUTEN_APPLICATION_ID = "mock-application-id";
  process.env.RAKUTEN_ACCESS_KEY = "mock-access-key";
  process.env.WEB_USE_FIXTURE = "false";
  process.env.ENABLE_TAVILY_PRICE_FALLBACK = "false";
  e2eMocks.openBrowser.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const [name, value] of Object.entries({
    RAKUTEN_OFFICIAL_API_ENABLED: previousEnv.apiEnabled,
    RAKUTEN_APPLICATION_ID: previousEnv.applicationId,
    RAKUTEN_ACCESS_KEY: previousEnv.accessKey,
    WEB_USE_FIXTURE: previousEnv.fixtureMode,
    ENABLE_TAVILY_PRICE_FALLBACK: previousEnv.tavilyEnabled,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllGlobals();
  vi.doUnmock("../src/server/providers/marketplaces/registry");
  vi.resetModules();
});

describe("Rakuten API end-to-end data flow", () => {
  it("maps five listing cases through matching/pricing and streams the API+Mercari result with accurate resource counts", async () => {
    const metrics = { pages: [] as string[], pageClosed: 0 };
    const context = browserContext(metrics);
    const fetchMock = vi.fn<typeof fetch>(async () => {
      await wait(5);
      return apiResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { coordinateMarketplaceSearches } = await import("../src/server/providers/marketplaces/coordinator");
    const { resetRakutenRateLimitForTests } = await import("../src/server/providers/marketplaces/rakuten-api-client");
    resetRakutenRateLimitForTests();
    const identified = identification();
    const profile = toPriceItemProfile(identified);
    const coordinated = await coordinateMarketplaceSearches({
      profile,
      keyword: identified.priceSearchKeywordJa,
      maxCardsPerSource: 30,
      getBrowserContext: async () => context as never,
    });
    const rakutenCandidates = coordinated.snapshot.sources[0]!.candidates;
    expect(rakutenCandidates.map(({ rank }) => rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rakutenCandidates[4]).toMatchObject({ availabilityText: "在庫なし", displayedPrice: 15_000 });

    const matched = buildPriceResult({
      profile,
      snapshot: coordinated.snapshot,
      tavilyFallback: disabledTavilyFallback(profile),
      storeSnapshot: disabledStoreSnapshot(),
      maxCardsScannedPerSource: 30,
      maxSamplesPerSource: 5,
    });
    expect(matched.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "Rakuten", rank: 2, reason: "different_model" }),
      expect.objectContaining({ source: "Rakuten", rank: 4, reason: "missing_price" }),
      expect.objectContaining({ source: "Rakuten", rank: 5, reason: "out_of_stock" }),
      expect.objectContaining({ source: "Rakuten", rank: 6, reason: "duplicate" }),
    ]));
    expect(matched.excluded.some((entry) => entry.url === "https://item.rakuten.co.jp/shop/unavailable" && entry.reason === "sold_out")).toBe(false);
    expect(matched.result.samples.map(({ source, price }) => [source, price])).toEqual([
      ["Rakuten", 10_000],
      ["Rakuten", 12_000],
      ["Mercari", 11_000],
    ]);
    expect(matched.result.samples.find(({ url }) => url.endsWith("no-box"))?.packageStatus).toBe("without_box");
    expect(matched.result.referenceRange).toMatchObject({ low: 10_000, median: 11_000, high: 12_000, sampleCount: 3 });

    fetchMock.mockClear();
    resetRakutenRateLimitForTests();
    metrics.pages.length = 0;
    metrics.pageClosed = 0;
    const closeLease = vi.fn(async () => undefined);
    e2eMocks.openBrowser.mockResolvedValue({ context, close: closeLease });
    const { resetDemoRateLimitForTests } = await import("../src/server/security/demo-rate-limit");
    resetDemoRateLimitForTests();
    const { POST } = await import("../src/app/api/analysis/[sessionId]/research/route");
    const runId = "00000000-0000-4000-8000-000000000091";
    const response = await POST(new Request(`http://localhost/api/analysis/${runId}/research`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.91" },
      body: JSON.stringify({ identification: identified, collectorMode: false }),
    }), { params: Promise.resolve({ sessionId: runId }) });
    const lines = (await response.text()).trim().split("\n");
    const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.every((event) => validateResearchStreamEvent(event).kind === "valid")).toBe(true);
    const completed = events.at(-1) as { result: { priceReference: { low: number; median: number; high: number; sampleCount: number }; cost: { marketplacePages: number } }; toolActivity: Array<{ provider: string; calls: number; durationMs: number | null; resultCount?: number }> };
    expect(completed.result.priceReference).toMatchObject({ low: 10_000, median: 11_000, high: 12_000, sampleCount: 3 });
    expect(completed.result.cost.marketplacePages).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(e2eMocks.openBrowser).toHaveBeenCalledOnce();
    expect(metrics.pages).toHaveLength(1);
    expect(metrics.pages[0]).toContain("jp.mercari.com/search");
    expect(metrics.pageClosed).toBe(1);
    expect(closeLease).toHaveBeenCalledOnce();
    const rakutenActivity = completed.toolActivity.find(({ provider }) => provider === "Rakuten");
    const mercariActivity = completed.toolActivity.find(({ provider }) => provider === "Mercari");
    expect(rakutenActivity).toMatchObject({ calls: 1, resultCount: 6 });
    expect(mercariActivity).toMatchObject({ calls: 1, resultCount: 1 });
    expect(rakutenActivity?.durationMs).toEqual(expect.any(Number));
    expect(mercariActivity?.durationMs).toEqual(expect.any(Number));
    expect(mercariActivity!.durationMs!).toBeGreaterThan(rakutenActivity!.durationMs!);
  });

  it("runs the actual Rakuten Provider as API-only without opening a Browser lease", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(apiResponse()));
    const { rakutenProvider } = await import("../src/server/providers/marketplaces/rakuten");
    vi.doMock("../src/server/providers/marketplaces/registry", () => ({
      marketplaceRegistry: [{ id: "Rakuten", status: "enabled", provider: rakutenProvider }],
    }));
    vi.resetModules();
    const { resetRakutenRateLimitForTests } = await import("../src/server/providers/marketplaces/rakuten-api-client");
    resetRakutenRateLimitForTests();
    const { researchCollectible } = await import("../src/server/analysis/run-pipeline");

    const result = await researchCollectible({ identification: identification(), collectorMode: false, collectorEvidence: null });

    expect(e2eMocks.openBrowser).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.result.cost.marketplacePages).toBe(0);
    expect(result.toolActivity.find(({ provider }) => provider === "Rakuten")).toMatchObject({ status: "succeeded", calls: 1, resultCount: 6 });
    expect(result.toolActivity.find(({ provider }) => provider === "Mercari")).toMatchObject({ status: "skipped", calls: 0 });
    expect(result.result.priceReference.sampleCount).toBe(2);
  });

  it("keeps the Mercari sample and the Rakuten API error in the NDJSON result after HTTP failure", async () => {
    const metrics = { pages: [] as string[], pageClosed: 0 };
    const context = browserContext(metrics);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "system_error" }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    e2eMocks.openBrowser.mockResolvedValue({ context, close: vi.fn(async () => undefined) });
    const { resetDemoRateLimitForTests } = await import("../src/server/security/demo-rate-limit");
    resetDemoRateLimitForTests();
    const { POST } = await import("../src/app/api/analysis/[sessionId]/research/route");
    const runId = "00000000-0000-4000-8000-000000000092";
    const response = await POST(new Request(`http://localhost/api/analysis/${runId}/research`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.92" },
      body: JSON.stringify({ identification: identification(), collectorMode: false }),
    }), { params: Promise.resolve({ sessionId: runId }) });
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    const completed = events.at(-1) as { result: { priceReference: { sampleCount: number; samples: Array<{ source: string }> } }; toolActivity: Array<{ provider: string; status: string; resultCount?: number }> };

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(e2eMocks.openBrowser).toHaveBeenCalledOnce();
    expect(metrics.pages).toHaveLength(1);
    expect(completed.result.priceReference.sampleCount).toBe(1);
    expect(completed.result.priceReference.samples[0]?.source).toBe("Mercari");
    expect(completed.toolActivity.find(({ provider }) => provider === "Rakuten")).toMatchObject({ status: "failed", resultCount: 0 });
    expect(completed.toolActivity.find(({ provider }) => provider === "Mercari")).toMatchObject({ status: "succeeded", resultCount: 1 });
  });
});