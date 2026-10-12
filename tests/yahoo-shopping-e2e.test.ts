import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const yahooE2eMocks = vi.hoisted(() => ({ openBrowser: vi.fn() }));
vi.mock("../src/server/browser/browser-provider", () => ({ browserProvider: { open: yahooE2eMocks.openBrowser } }));

import { validateResearchStreamEvent } from "../src/features/analysis/services/research-stream";
import type { DetectionResult, PokemonCardIdentity } from "../src/core/profile/types";
import { classifyIdentityMatch } from "../src/price/identity";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import type { ItemProfile } from "../src/price/item-profile";

const previousEnv = {
  yahooEnabled: process.env.YAHOO_SHOPPING_API_ENABLED,
  yahooAppId: process.env.YAHOO_SHOPPING_APP_ID,
  fixtureMode: process.env.WEB_USE_FIXTURE,
  tavilyEnabled: process.env.ENABLE_TAVILY_PRICE_FALLBACK,
};

function result(hits: unknown[]): Response {
  return new Response(JSON.stringify({ totalResultsAvailable: hits.length, totalResultsReturned: hits.length, hits }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function identification(): DetectionResult {
  return {
    itemName: "Sony PSP-3000",
    version: "PSP-3000",
    priceSearchKeywordJa: "PSP-3000 本体 中古",
    category: "Cards & Game Collectibles",
  };
}

const exactHits = [
  { index: 1, name: "Sony PSP-3000 本体 中古 ブラック", url: "https://store.shopping.yahoo.co.jp/a/psp-3000-black", code: "a:psp-black", condition: "used", inStock: true, price: 10000, seller: { name: "Store A", sellerId: "a" } },
  { index: 2, name: "Sony PSP-2000 本体 中古 ブラック", url: "https://store.shopping.yahoo.co.jp/a/psp-2000", code: "a:psp-2000", condition: "used", inStock: true, price: 8000, seller: { name: "Store A", sellerId: "a" } },
  { index: 3, name: "Sony PSP handheld 本体 中古", url: "https://store.shopping.yahoo.co.jp/b/psp-unknown", code: "b:unknown", condition: "used", inStock: true, price: 9000, seller: { name: "Store B", sellerId: "b" } },
  { index: 4, name: "Sony PSP-3000 本体 中古 価格未掲載", url: "https://store.shopping.yahoo.co.jp/c/psp-no-price", code: "c:no-price", condition: "used", inStock: true, price: null, seller: { name: "Store C", sellerId: "c" } },
  { index: 5, name: "Sony PSP-3000 本体 中古 在庫切れ", url: "https://store.shopping.yahoo.co.jp/d/psp-out", code: "d:out", condition: "used", inStock: false, price: 11000, seller: { name: "Store D", sellerId: "d" } },
  { index: 6, name: "Sony PSP-3000 本体 中古 ブラック", url: "https://store.shopping.yahoo.co.jp/e/psp-duplicate", code: "e:duplicate", condition: "used", inStock: true, price: 10000, seller: { name: "Store E", sellerId: "e" } },
];

const relaxedHits = [
  { index: 1, name: "Sony PSP-3000 本体 中古 ホワイト", url: "https://store.shopping.yahoo.co.jp/f/psp-white", code: "f:white", condition: "used", inStock: true, price: 12000, seller: { name: "Store F", sellerId: "f" } },
  { index: 2, name: "Sony PSP-3000 本体 中古 シルバー", url: "https://store.shopping.yahoo.co.jp/g/psp-silver", code: "g:silver", condition: "used", inStock: true, price: 11000, seller: { name: "Store G", sellerId: "g" } },
  { index: 3, name: "Sony PSP-3000 本体 中古 ブルー", url: "https://store.shopping.yahoo.co.jp/h/psp-blue", code: "h:blue", condition: "used", inStock: true, price: 13000, seller: { name: "Store H", sellerId: "h" } },
  { index: 4, name: "Sony PSP-3000 本体 中古 レッド", url: "https://store.shopping.yahoo.co.jp/i/psp-red", code: "i:red", condition: "used", inStock: true, price: 14000, seller: { name: "Store I", sellerId: "i" } },
];

beforeEach(() => {
  process.env.YAHOO_SHOPPING_API_ENABLED = "true";
  process.env.YAHOO_SHOPPING_APP_ID = "fixture-client-id";
  process.env.WEB_USE_FIXTURE = "false";
  process.env.ENABLE_TAVILY_PRICE_FALLBACK = "false";
  yahooE2eMocks.openBrowser.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const [key, value] of Object.entries({
    YAHOO_SHOPPING_API_ENABLED: previousEnv.yahooEnabled,
    YAHOO_SHOPPING_APP_ID: previousEnv.yahooAppId,
    WEB_USE_FIXTURE: previousEnv.fixtureMode,
    ENABLE_TAVILY_PRICE_FALLBACK: previousEnv.tavilyEnabled,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.doUnmock("../src/server/providers/marketplaces/registry");
  vi.resetModules();
});

describe("Yahoo! Shopping Provider MVP fixtures", () => {
  it("uses one precise plus at most one relaxed used query and carries candidates through Pricing and NDJSON without Browser", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const query = new URL(String(input)).searchParams.get("query");
      return query === "PSP-3000 本体" ? result(exactHits) : result(relaxedHits);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    vi.doMock("../src/server/providers/marketplaces/registry", () => ({
      marketplaceRegistry: [{ id: "Yahoo! Shopping", status: "enabled", provider: yahooShoppingProvider }],
    }));
    vi.resetModules();
    const { resetYahooShoppingRateLimitForTests } = await import("../src/server/providers/marketplaces/yahoo-shopping-api-client");
    resetYahooShoppingRateLimitForTests();
    const detection = identification();
    const { researchCollectible } = await import("../src/server/analysis/run-pipeline");
    const directResult = await researchCollectible({ identification: detection, collectorMode: false, collectorEvidence: null });
    expect(directResult.result.priceReference).toMatchObject({ low: 10_000, median: 12_000, high: 14_000, sampleCount: 5 });
    expect(yahooE2eMocks.openBrowser).not.toHaveBeenCalled();
    fetchMock.mockClear();
    resetYahooShoppingRateLimitForTests();
    const { resetDemoRateLimitForTests } = await import("../src/server/security/demo-rate-limit");
    resetDemoRateLimitForTests();
    const { POST } = await import("../src/app/api/analysis/[sessionId]/research/route");
    const runId = "00000000-0000-4000-8000-000000000201";
    const responseStream = await POST(new Request(`http://localhost/api/analysis/${runId}/research`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.201" },
      body: JSON.stringify({ identification: detection, collectorMode: false }),
    }), { params: Promise.resolve({ sessionId: runId }) });
    const events = (await responseStream.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.every((event) => validateResearchStreamEvent(event).kind === "valid")).toBe(true);
    expect(events.at(-1), JSON.stringify(events.at(-1))).toMatchObject({ type: "completed" });
    const completed = events.at(-1) as {
      result: { priceReference: { low: number; median: number; high: number; sampleCount: number; samples: Array<{ source: string; price: number; url: string }> }; cost: { marketplacePages: number } };
      toolActivity: Array<{ provider: string; status: string; calls: number; resultCount?: number; validResultCount?: number }>;
    };

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(requests.map((url) => url.searchParams.get("query"))).toEqual([
      "PSP-3000 本体",
      "Sony PSP-3000",
    ]);
    expect(requests.every((url) => url.searchParams.get("condition") === "used" && url.searchParams.get("results") === "30")).toBe(true);
    expect(yahooE2eMocks.openBrowser).not.toHaveBeenCalled();
    expect(completed.result.cost.marketplacePages).toBe(0);
    expect(completed.result.priceReference.samples.map(({ price }) => price)).toEqual([10_000, 12_000, 11_000, 13_000, 14_000]);
    expect(completed.result.priceReference.samples.every(({ source }) => source === "Yahoo! Shopping")).toBe(true);
    expect(completed.result.priceReference).toMatchObject({ low: 10_000, median: 12_000, high: 14_000, sampleCount: 5 });
    expect(completed.toolActivity.find(({ provider }) => provider === "Yahoo! Shopping")).toMatchObject({ status: "succeeded", calls: 2, resultCount: 10, validResultCount: 5 });
  });

  it("distinguishes missing model identity from an explicit model conflict", () => {
    const profile: ItemProfile = {
      itemName: "Sony PSP-3000",
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

    expect(classifyIdentityMatch(profile, "Sony PSP handheld console used")).toBe("unknown");
    expect(classifyIdentityMatch(profile, "Sony PSP-2000 handheld console used")).toBe("conflict");
    expect(classifyIdentityMatch(profile, "Sony PSP-3000 handheld console used")).toBe("match");
  });

  it("rejects a conflicting card edition/language and keeps missing identifiers unconfirmed", () => {
    const card: PokemonCardIdentity = {
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
    const profile = toPriceItemProfile({
      itemName: "リザードンex 201/165",
      version: "SV2a SAR",
      priceSearchKeywordJa: "リザードンex SV2a 201/165 SAR 中古",
      category: "Cards & Game Collectibles",
      pokemonCard: card,
    });

    expect(classifyIdentityMatch(profile, "リザードンex SV2a 201/165 SAR 日本語版 中古")).toBe("match");
    expect(classifyIdentityMatch(profile, "リザードンex SV2a 201/165 SAR 英語版 English Version 中古")).toBe("conflict");
    expect(classifyIdentityMatch(profile, "リザードンex SV2a SAR 日本語版 中古")).toBe("unknown");
  });

  it("supports the optional Surugaya seller_id/in_stock filters without changing the default behavior", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("query")).toBe("PSP-3000");
      expect(url.searchParams.get("seller_id")).toBe("suruga-ya");
      expect(url.searchParams.get("condition")).toBe("used");
      expect(url.searchParams.get("in_stock")).toBe("true");
      expect(url.searchParams.get("results")).toBe("20");
      return new Response(JSON.stringify({
        totalResultsAvailable: 1,
        totalResultsReturned: 1,
        hits: [{
          name: "Sony PSP-3000 本体 中古",
          url: "https://store.shopping.yahoo.co.jp/suruga-ya/psp-3000",
          code: "suruga-ya:psp-3000",
          condition: "used",
          inStock: true,
          price: 12000,
          seller: { name: "駿河屋", sellerId: "suruga-ya" },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchYahooShoppingItems, resetYahooShoppingRateLimitForTests } = await import("../src/server/providers/marketplaces/yahoo-shopping-api-client");
    resetYahooShoppingRateLimitForTests();
    const response = await fetchYahooShoppingItems("PSP-3000", {
      sellerId: "suruga-ya",
      condition: "used",
      inStock: true,
      results: 20,
    });

    expect(response.hits).toHaveLength(1);
    expect(response.hits[0]).toMatchObject({
      name: "Sony PSP-3000 本体 中古",
      url: "https://store.shopping.yahoo.co.jp/suruga-ya/psp-3000",
      condition: "used",
      inStock: true,
      price: 12000,
      seller: { sellerId: "suruga-ya" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the API disabled in the registry unless explicitly opted in", async () => {
    delete process.env.YAHOO_SHOPPING_API_ENABLED;
    vi.resetModules();
    const { marketplaceRegistry } = await import("../src/server/providers/marketplaces/registry");
    const yahoo = marketplaceRegistry.find((entry) => entry.id === "Yahoo! Shopping");
    expect(yahoo?.status).toBe("disabled");
    expect(yahooE2eMocks.openBrowser).not.toHaveBeenCalled();
  });
});