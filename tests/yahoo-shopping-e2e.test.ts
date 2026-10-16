import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const yahooE2eMocks = vi.hoisted(() => ({ openBrowser: vi.fn() }));
vi.mock("../src/server/browser/browser-provider", () => ({ browserProvider: { open: yahooE2eMocks.openBrowser } }));

import { validateResearchStreamEvent } from "../src/features/analysis/services/research-stream";
import type { DetectionResult, PokemonCardIdentity } from "../src/core/profile/types";
import { classifyIdentityMatch } from "../src/price/identity";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import type { ItemProfile } from "../src/price/item-profile";
import { createRecognitionSnapshot } from "../src/server/analysis/keyword-resolution";

const previousEnv = {
  yahooEnabled: process.env.YAHOO_SHOPPING_API_ENABLED,
  yahooAppId: process.env.YAHOO_SHOPPING_APP_ID,
  janparaStoreSearchEnabled: process.env.JANPARA_YAHOO_SHOPPING_STORE_SEARCH_ENABLED,
  yahooSearchMode: process.env.YAHOO_SHOPPING_SEARCH_MODE,
  yahooMaxSellerSearches: process.env.YAHOO_SHOPPING_MAX_SELLER_SEARCHES,
  fixtureMode: process.env.WEB_USE_FIXTURE,
  tavilyEnabled: process.env.ENABLE_TAVILY_PRICE_FALLBACK,
  snapshotSecret: process.env.RECOGNITION_SNAPSHOT_SECRET,
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
  process.env.RECOGNITION_SNAPSHOT_SECRET = "test-recognition-snapshot-secret-with-high-entropy";
  process.env.YAHOO_SHOPPING_API_ENABLED = "true";
  process.env.YAHOO_SHOPPING_APP_ID = "fixture-client-id";
  delete process.env.JANPARA_YAHOO_SHOPPING_STORE_SEARCH_ENABLED;
  process.env.WEB_USE_FIXTURE = "false";
  process.env.ENABLE_TAVILY_PRICE_FALLBACK = "false";
  process.env.YAHOO_SHOPPING_SEARCH_MODE = "all-relevant";
  yahooE2eMocks.openBrowser.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const [key, value] of Object.entries({
    YAHOO_SHOPPING_API_ENABLED: previousEnv.yahooEnabled,
    YAHOO_SHOPPING_APP_ID: previousEnv.yahooAppId,
    JANPARA_YAHOO_SHOPPING_STORE_SEARCH_ENABLED: previousEnv.janparaStoreSearchEnabled,
    YAHOO_SHOPPING_SEARCH_MODE: previousEnv.yahooSearchMode,
    YAHOO_SHOPPING_MAX_SELLER_SEARCHES: previousEnv.yahooMaxSellerSearches,
    WEB_USE_FIXTURE: previousEnv.fixtureMode,
    ENABLE_TAVILY_PRICE_FALLBACK: previousEnv.tavilyEnabled,
    RECOGNITION_SNAPSHOT_SECRET: previousEnv.snapshotSecret,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.doUnmock("../src/server/providers/marketplaces/registry");
  vi.resetModules();
});

describe("Yahoo! Shopping Provider MVP fixtures", () => {
  it("uses one all-site query and only the seller searches needed to reach the Matcher target", async () => {
    process.env.YAHOO_SHOPPING_SEARCH_MODE = "optimized";
    const sofmapHits = relaxedHits.map((hit) => ({
      ...hit,
      url: `https://store.shopping.yahoo.co.jp/u-sofmap/${hit.code}.html`,
      code: `u-sofmap:${hit.code}`,
      seller: { name: "ソフマップ中古専門店", sellerId: "u-sofmap" },
    }));
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return url.searchParams.get("seller_id") === "u-sofmap" ? result(sofmapHits) : result(exactHits);
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
    expect(directResult.result.discoveryListings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Sony PSP-3000 本体 中古 価格未掲載", price: null, availability: "available", matchConfidence: "exact" }),
      expect.objectContaining({ title: "Sony PSP-3000 本体 中古 在庫切れ", availability: "sold_out", matchConfidence: "exact" }),
    ]));
    expect(directResult.result.discoveryListings?.some(({ title }) => title.includes("PSP-2000"))).toBe(false);
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
      body: JSON.stringify({ identification: { itemName: detection.itemName, version: detection.version, category: detection.category, productType: detection.productType, pokemonCard: detection.pokemonCard }, recognitionSnapshot: createRecognitionSnapshot(runId, detection, null), collectorMode: false }),
    }), { params: Promise.resolve({ sessionId: runId }) });
    const events = (await responseStream.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.every((event) => validateResearchStreamEvent(event).kind === "valid")).toBe(true);
    expect(events.at(-1), JSON.stringify(events.at(-1))).toMatchObject({ type: "completed" });
    const completed = events.at(-1) as {
      result: { discoveryListings: Array<{ title: string; price: number | null; availability: string; matchConfidence: string }>; priceReference: { low: number; median: number; high: number; sampleCount: number; samples: Array<{ source: string; price: number; url: string }> }; cost: { marketplacePages: number } };
      toolActivity: Array<{ provider: string; status: string; calls: number; resultCount?: number; validResultCount?: number }>;
    };

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(requests.map((url) => url.searchParams.get("query"))).toEqual([
      "PSP-3000 本体",
      "PSP-3000 本体",
    ]);
    expect(requests.map((url) => url.searchParams.get("seller_id"))).toEqual([null, "u-sofmap"]);
    expect(requests.every((url) => url.searchParams.get("condition") === "used" && url.searchParams.get("results") === "30")).toBe(true);
    expect(yahooE2eMocks.openBrowser).not.toHaveBeenCalled();
    expect(completed.result.cost.marketplacePages).toBe(0);
    expect(completed.result.priceReference.samples.map(({ price }) => price)).toEqual([12_000, 11_000, 13_000, 14_000, 10_000]);
    expect(completed.result.priceReference.samples.every(({ source }) => source === "Yahoo! Shopping")).toBe(true);
    expect(completed.result.priceReference).toMatchObject({ low: 10_000, median: 12_000, high: 14_000, sampleCount: 5 });
    expect(completed.result.discoveryListings.length).toBeGreaterThan(0);
    expect(completed.toolActivity.find(({ provider }) => provider === "Yahoo! Shopping")).toMatchObject({ status: "succeeded", calls: 2, resultCount: 10, validResultCount: 5 });
  }, 15_000);

  it("keeps searching after raw hits fail the Matcher and stops at the configured seller budget", async () => {
    process.env.YAHOO_SHOPPING_SEARCH_MODE = "optimized";
    process.env.YAHOO_SHOPPING_MAX_SELLER_SEARCHES = "2";
    const invalidHits = [
      { ...exactHits[0], condition: "new" },
      { ...exactHits[0], code: "missing-price", price: null },
      { ...exactHits[0], code: "bundle", name: "Sony PSP-3000 本体 中古 ゲームソフト 5本セット" },
      { ...exactHits[0], code: "wrong-model", name: "Sony PSP-2000 本体 中古 ブラック" },
    ];
    const sofmapHit = {
      name: "Sony PSP-3000 本体 中古 ホワイト",
      url: "https://store.shopping.yahoo.co.jp/u-sofmap/psp-3000-white.html",
      code: "u-sofmap:psp-3000-white",
      condition: "used",
      inStock: true,
      price: 12000,
      seller: { name: "ソフマップ中古専門店", sellerId: "u-sofmap" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.has("seller_id")) return result([sofmapHit]);
      return result(invalidHits);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const { resetYahooShoppingRateLimitForTests } = await import("../src/server/providers/marketplaces/yahoo-shopping-api-client");
    resetYahooShoppingRateLimitForTests();
    const snapshot = await yahooShoppingProvider.search({ profile: toPriceItemProfile(identification()), keyword: "ignored", maxCards: 30 });
    const sellerIds = fetchMock.mock.calls.map(([input]) => new URL(String(input)).searchParams.get("seller_id")).filter(Boolean);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sellerIds).toEqual(["u-sofmap"]);
    expect(snapshot.diagnostics?.[0]).toMatchObject({ incrementalPricingSamplesBySellerId: { "u-sofmap": 1 } });
  }, 15_000);

  it("does not bypass a Yahoo authorization gate with seller searches", async () => {
    process.env.YAHOO_SHOPPING_SEARCH_MODE = "optimized";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const { resetYahooShoppingRateLimitForTests } = await import("../src/server/providers/marketplaces/yahoo-shopping-api-client");
    resetYahooShoppingRateLimitForTests();
    const snapshot = await yahooShoppingProvider.search({ profile: toPriceItemProfile(identification()), keyword: "ignored", maxCards: 30 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.error).toContain("HTTP 403");
  });

  it("limits optimized fashion profiles to two distinct related sellers", async () => {
    process.env.YAHOO_SHOPPING_SEARCH_MODE = "optimized";
    process.env.YAHOO_SHOPPING_MAX_SELLER_SEARCHES = "2";
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "Yohji Yamamoto Pour Homme Jacket",
      version: "Yohji Yamamoto",
      priceSearchKeywordJa: "Yohji Yamamoto ジャケット 古着 中古",
    });
    await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    const sellerIds = fetchMock.mock.calls.map(([input]) => new URL(String(input)).searchParams.get("seller_id")).filter(Boolean);

    expect(sellerIds).toHaveLength(2);
    expect(new Set(sellerIds).size).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("marks the Yahoo price signal preliminary when its request budget cannot meet the sample target", async () => {
    process.env.YAHOO_SHOPPING_SEARCH_MODE = "optimized";
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);
    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    vi.doMock("../src/server/providers/marketplaces/registry", () => ({
      marketplaceRegistry: [{ id: "Yahoo! Shopping", status: "enabled", provider: yahooShoppingProvider }],
    }));
    vi.resetModules();
    const { resetYahooShoppingRateLimitForTests } = await import("../src/server/providers/marketplaces/yahoo-shopping-api-client");
    resetYahooShoppingRateLimitForTests();
    const { researchCollectible } = await import("../src/server/analysis/run-pipeline");

    const resultValue = await researchCollectible({ identification: identification(), collectorMode: false, collectorEvidence: null });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultValue.result.warnings).toContain("Yahoo! Shopping reached its available search budget with 0 of 5 target reference samples; treat its price signal as preliminary.");
  }, 15_000);

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

  it("adds configured Janpara listings through the shared client and keeps them under Yahoo Shopping", async () => {
    process.env.JANPARA_YAHOO_SHOPPING_STORE_SEARCH_ENABLED = "true";
    const janparaHit = {
      name: "Sony PSP-3000 本体 中古 ブラック",
      url: "https://store.shopping.yahoo.co.jp/janpara/psp-3000-black.html?tracking=1",
      code: "psp-3000-black",
      condition: "used",
      inStock: true,
      price: 10000,
      seller: { name: "じゃんぱら Yahoo!店", sellerId: "janpara" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "janpara") {
        expect(url.searchParams.get("condition")).toBe("used");
        expect(url.searchParams.get("in_stock")).toBe("true");
        expect(url.searchParams.get("results")).toBe("30");
        return result([
          janparaHit,
          { ...janparaHit, url: "https://store.shopping.yahoo.co.jp/janpara/out.html", code: "out", inStock: false },
          { ...janparaHit, url: "https://store.shopping.yahoo.co.jp/janpara/new.html", code: "new", condition: "new" },
          { ...janparaHit, url: "https://store.shopping.yahoo.co.jp/other/item.html", code: "wrong-store" },
          { ...janparaHit, url: "https://store.shopping.yahoo.co.jp/janpara/price.html", code: "no-price", price: null },
        ]);
      }
      return result([{ ...janparaHit, url: "https://store.shopping.yahoo.co.jp/janpara/psp-3000-black.html" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile(identification());
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    const janparaRequest = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.searchParams.get("seller_id") === "janpara");

    expect(YAHOO_SHOPPING_STORES.janpara).toEqual({
      storeId: "janpara",
      storeName: "じゃんぱら",
      channel: "yahoo-shopping",
      sellerId: "janpara",
      categories: ["electronics", "cameras", "computers", "gaming"],
    });
    expect(janparaRequest?.searchParams.get("query")).toBe("PSP-3000 本体");
    expect(snapshot.source).toBe("Yahoo! Shopping");
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      source: "Yahoo! Shopping",
      title: janparaHit.name,
      displayedPrice: 10000,
      shopName: "じゃんぱら Yahoo!店",
      availabilityText: "",
      listingCondition: "used",
    });
    expect(snapshot.candidates[0]?.url).toBe("https://store.shopping.yahoo.co.jp/janpara/psp-3000-black.html");
  });

  it("does not query or price Janpara while its conservative local search switch is off", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result([
      {
        name: "Sony PSP-3000 本体 中古 ブラック",
        url: "https://store.shopping.yahoo.co.jp/janpara/psp-3000-black.html",
        code: "janpara:psp-3000-black",
        condition: "used",
        inStock: true,
        price: 10000,
        seller: { name: "じゃんぱら", sellerId: "janpara" },
      },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile(identification());
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("seller_id") === "janpara")).toBe(false);
    expect(snapshot.candidates).toHaveLength(0);
  });

  it("uses the same filtered store search for KOMEHYO and deduplicates its full-site result", async () => {
    const komehyoHit = {
      name: "ROLEX Submariner 腕時計 中古",
      url: "https://store.shopping.yahoo.co.jp/komehyo/submariner.html?source=all",
      code: "submariner-001",
      condition: "used",
      inStock: true,
      price: 980000,
      seller: { name: "株式会社コメ兵 Yahoo!店", sellerId: "komehyo" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "komehyo") {
        expect(url.searchParams.get("condition")).toBe("used");
        expect(url.searchParams.get("in_stock")).toBe("true");
        expect(url.searchParams.get("results")).toBe("30");
        return result([
          komehyoHit,
          { ...komehyoHit, url: "https://store.shopping.yahoo.co.jp/komehyo/submariner.html?duplicate=1" },
          { ...komehyoHit, url: "https://store.shopping.yahoo.co.jp/komehyo/sold.html", inStock: false },
          { ...komehyoHit, url: "https://store.shopping.yahoo.co.jp/komehyo/new.html", condition: "new" },
          { ...komehyoHit, url: "https://store.shopping.yahoo.co.jp/other/item.html" },
          { ...komehyoHit, url: "https://store.shopping.yahoo.co.jp/komehyo/no-price.html", price: 0 },
        ]);
      }
      return result([komehyoHit]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "ROLEX Submariner 腕時計",
      version: "Submariner",
      priceSearchKeywordJa: "ROLEX Submariner 腕時計 中古",
    });
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const storeRequest = requests.find((url) => url.searchParams.get("seller_id") === "komehyo");

    expect(YAHOO_SHOPPING_STORES.komehyo).toEqual({
      storeId: "komehyo",
      storeName: "KOMEHYO",
      channel: "yahoo-shopping",
      sellerId: "komehyo",
      categories: ["watches", "jewelry", "luxury_bags", "fashion"],
    });
    expect(storeRequest?.searchParams.get("query")).toBe("ROLEX Submariner 腕時計");
    expect(snapshot.source).toBe("Yahoo! Shopping");
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      source: "Yahoo! Shopping",
      displayedPrice: 980000,
      shopName: "株式会社コメ兵 Yahoo!店",
      availabilityText: "",
      listingCondition: "used",
    });
  });

  it("searches 2nd STREET only for relevant profiles and preserves the API seller and raw title", async () => {
    const secondStreetHit = {
      name: "  NIKE Air Max\n中古 スニーカー  ",
      url: "https://store.shopping.yahoo.co.jp/ssol-shopping/air-max.html?from=all-search",
      code: "air-max-001",
      condition: "used",
      inStock: true,
      price: 8800,
      seller: { name: "株式会社セカンドストリート Yahoo!店", sellerId: "ssol-shopping" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "ssol-shopping") {
        expect(url.searchParams.get("condition")).toBe("used");
        expect(url.searchParams.get("in_stock")).toBe("true");
        expect(url.searchParams.get("results")).toBe("30");
        return result([
          secondStreetHit,
          { ...secondStreetHit, url: "https://store.shopping.yahoo.co.jp/ssol-shopping/air-max.html?duplicate=1" },
          { ...secondStreetHit, url: "https://store.shopping.yahoo.co.jp/ssol-shopping/sold.html", inStock: false },
          { ...secondStreetHit, url: "https://store.shopping.yahoo.co.jp/ssol-shopping/new.html", condition: "new" },
          { ...secondStreetHit, url: "https://store.shopping.yahoo.co.jp/other/item.html" },
          { ...secondStreetHit, url: "https://store.shopping.yahoo.co.jp/ssol-shopping/no-price.html", price: 0 },
        ]);
      }
      return result([secondStreetHit]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "NIKE Air Max スニーカー",
      version: "Air Max",
      priceSearchKeywordJa: "NIKE Air Max シューズ スニーカー 中古",
    });
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const storeRequest = requests.find((url) => url.searchParams.get("seller_id") === "ssol-shopping");

    expect(YAHOO_SHOPPING_STORES.secondStreet).toEqual({
      storeId: "ssol-shopping",
      storeName: "2nd STREET",
      channel: "yahoo-shopping",
      sellerId: "ssol-shopping",
      categories: ["fashion", "shoes", "bags", "outdoor", "sports", "accessories", "home_goods"],
    });
    expect(storeRequest?.searchParams.get("query")).toBe("NIKE Air Max シューズ スニーカー");
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      source: "Yahoo! Shopping",
      title: secondStreetHit.name,
      shopName: "株式会社セカンドストリート Yahoo!店",
      displayedPrice: 8800,
      availabilityText: "",
      listingCondition: "used",
    });
  }, 20_000);

  it("keeps identical-URL quotes from different sellers distinct in the Yahoo provider", async () => {
    const sellerA = { ...exactHits[0], url: "https://store.shopping.yahoo.co.jp/shared/item.html", seller: { name: "Seller A", sellerId: "seller-a" } };
    const sellerB = { ...exactHits[0], url: "https://store.shopping.yahoo.co.jp/shared/item.html", seller: { name: "Seller B", sellerId: "seller-b" } };
    const fetchMock = vi.fn<typeof fetch>(async () => result([sellerA, sellerB]));
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile(identification());
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });

    expect(snapshot.candidates.filter(({ url }) => url === sellerA.url)).toHaveLength(2);
    expect(snapshot.candidates.filter(({ url }) => url === sellerA.url).map(({ shopName }) => shopName)).toEqual(["Seller A", "Seller B"]);
  });

  it("searches Sofmap once for an iPhone profile and preserves its API seller and title", async () => {
    const sofmapHit = {
      name: "Apple iPhone 15 128GB 中古",
      url: "https://store.shopping.yahoo.co.jp/u-sofmap/iphone-15.html?source=api",
      code: "iphone-15-128gb",
      condition: "used",
      inStock: true,
      price: 89800,
      seller: { name: "ソフマップ中古専門店", sellerId: "u-sofmap" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "u-sofmap") {
        expect(url.searchParams.get("condition")).toBe("used");
        expect(url.searchParams.get("in_stock")).toBe("true");
        expect(url.searchParams.get("results")).toBe("30");
        return result([sofmapHit, { ...sofmapHit, url: "https://store.shopping.yahoo.co.jp/u-sofmap/iphone-15.html?duplicate=1" }]);
      }
      return result([sofmapHit]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "Apple iPhone 15 128GB",
      version: "iPhone 15",
      priceSearchKeywordJa: "Apple iPhone 15 128GB 中古",
    });
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const storeRequests = requests.filter((url) => url.searchParams.get("seller_id") === "u-sofmap");

    expect(YAHOO_SHOPPING_STORES.sofmapUsed).toEqual({
      storeId: "u-sofmap",
      storeName: "株式会社ソフマップ",
      channel: "yahoo-shopping",
      sellerId: "u-sofmap",
      categories: ["electronics", "smartphones", "computers", "cameras", "gaming"],
    });
    expect(storeRequests).toHaveLength(1);
    expect(storeRequests[0]?.searchParams.get("query")).toBe("Apple iPhone 15 128GB");
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      source: "Yahoo! Shopping",
      title: sofmapHit.name,
      shopName: "ソフマップ中古専門店",
      displayedPrice: 89800,
      availabilityText: "",
      listingCondition: "used",
    });
  });

  it("does not query Sofmap for an unrelated luxury profile", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "CHANEL Classic Flap Bag",
      version: "Medium",
      priceSearchKeywordJa: "CHANEL マトラッセ バッグ 中古",
    });
    await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });

    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("seller_id") === "u-sofmap")).toBe(false);
  }, 20_000);

  it("searches Kitamura for Canon EOS profiles and deduplicates URL query variants", async () => {
    const cameraHit = {
      name: "Canon EOS R6 Mark II ボディ 中古",
      url: "https://store.shopping.yahoo.co.jp/emedama/eos-r6m2.html?from=all",
      code: "eos-r6m2-body",
      condition: "used",
      inStock: true,
      price: 289800,
      seller: { name: "カメラのキタムラ Yahoo!店", sellerId: "emedama" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "emedama") {
        expect(url.searchParams.get("condition")).toBe("used");
        expect(url.searchParams.get("in_stock")).toBe("true");
        expect(url.searchParams.get("results")).toBe("30");
        return result([cameraHit, { ...cameraHit, url: "https://store.shopping.yahoo.co.jp/emedama/eos-r6m2.html?duplicate=1" }]);
      }
      return result([cameraHit]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "Canon EOS R6 Mark II",
      version: "EOS R6 Mark II body",
      priceSearchKeywordJa: "Canon EOS R6 Mark II ボディ 中古",
    });
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const storeRequests = requests.filter((url) => url.searchParams.get("seller_id") === "emedama");

    expect(YAHOO_SHOPPING_STORES.kitamura).toEqual({
      storeId: "emedama",
      storeName: "カメラのキタムラ",
      channel: "yahoo-shopping",
      sellerId: "emedama",
      categories: ["cameras", "camera_lenses", "photography_equipment"],
    });
    expect(storeRequests).toHaveLength(1);
    expect(storeRequests[0]?.searchParams.get("query")).toBe("Canon EOS R6 Mark II ボディ");
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      source: "Yahoo! Shopping",
      title: cameraHit.name,
      shopName: "カメラのキタムラ Yahoo!店",
      displayedPrice: 289800,
      availabilityText: "",
      listingCondition: "used",
    });
  });

  it("searches Kitamura for Nikon NIKKOR lenses and preserves mount, aperture, and model text", async () => {
    const lensHit = {
      name: "Nikon NIKKOR Z 24-70mm f/2.8 S Zマウント 中古",
      url: "https://store.shopping.yahoo.co.jp/emedama/nikkor-z-24-70.html",
      code: "nikkor-z-24-70-f28s",
      condition: "used",
      inStock: true,
      price: 248000,
      seller: { name: "カメラのキタムラ Yahoo!店", sellerId: "emedama" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "emedama") return result([lensHit]);
      return result([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "Nikon NIKKOR Z 24-70mm f/2.8 S",
      version: "Z mount",
      priceSearchKeywordJa: "Nikon NIKKOR Z 24-70mm f/2.8 S Zマウント 中古",
    });
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });

    expect(fetchMock.mock.calls.filter(([input]) => new URL(String(input)).searchParams.get("seller_id") === "emedama")).toHaveLength(1);
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]?.title).toBe(lensHit.name);
  });

  it("searches BRAND OFF once for Louis Vuitton, Rolex, and Cartier profiles", async () => {
    const profiles = [
      {
        itemName: "Louis Vuitton Monogram Shoulder Bag M45254",
        version: "M45254",
        priceSearchKeywordJa: "Louis Vuitton Monogram Shoulder Bag M45254 中古",
        matchToken: "Louis Vuitton",
        title: "LOUIS VUITTON Monogram Shoulder Bag M45254 2004年製 中古",
        url: "https://store.shopping.yahoo.co.jp/brandoff/lv-m45254.html?from=all",
        price: 148000,
      },
      {
        itemName: "Rolex Datejust 36 126234",
        version: "126234",
        priceSearchKeywordJa: "Rolex Datejust 36 126234 Oystersteel 中古",
        matchToken: "Rolex",
        title: "ROLEX Datejust 36 126234 Oystersteel White Gold Bezel 2021 中古",
        url: "https://store.shopping.yahoo.co.jp/brandoff/rolex-126234.html?from=all",
        price: 1280000,
      },
      {
        itemName: "Cartier Love Ring 750WG",
        version: "52",
        priceSearchKeywordJa: "Cartier Love Ring 750WG 52号 中古",
        matchToken: "Cartier",
        title: "Cartier LOVE Ring 750WG 52号 中古",
        url: "https://store.shopping.yahoo.co.jp/brandoff/cartier-love-ring.html?from=all",
        price: 198000,
      },
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") !== "brandoff") return result([]);
      expect(url.searchParams.get("condition")).toBe("used");
      expect(url.searchParams.get("in_stock")).toBe("true");
      expect(url.searchParams.get("results")).toBe("30");
      const query = url.searchParams.get("query") ?? "";
      const item = profiles.find(({ matchToken }) => query.includes(matchToken)) ?? profiles[0]!;
      const listing = {
        name: item.title,
        url: item.url,
        code: item.itemName,
        condition: "used",
        inStock: true,
        price: item.price,
        seller: { name: "ブランドオフ Yahoo!店", sellerId: "brandoff" },
      };
      return result([
        listing,
        { ...listing, url: `${new URL(listing.url).origin}${new URL(listing.url).pathname}?from=store` },
        { ...listing, url: "https://store.shopping.yahoo.co.jp/brandoff/wrong-seller.html", seller: { name: "Other seller", sellerId: "other" } },
        { ...listing, url: "https://store.shopping.yahoo.co.jp/other/item.html" },
        { ...listing, url: "https://store.shopping.yahoo.co.jp/brandoff/sold.html", inStock: false },
        { ...listing, url: "https://store.shopping.yahoo.co.jp/brandoff/new.html", condition: "new" },
        { ...listing, url: "https://store.shopping.yahoo.co.jp/brandoff/no-price.html", price: 0 },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const observedStoreRequests: URL[] = [];
    for (const item of profiles) {
      const profile = toPriceItemProfile({ ...identification(), ...item });
      const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
      const storeRequests = fetchMock.mock.calls
        .map(([input]) => new URL(String(input)))
        .filter((url) => url.searchParams.get("seller_id") === "brandoff");
      expect(storeRequests).toHaveLength(observedStoreRequests.length + 1);
      observedStoreRequests.push(storeRequests.at(-1)!);
      expect(snapshot.candidates).toHaveLength(1);
      expect(snapshot.candidates[0]).toMatchObject({
        source: "Yahoo! Shopping",
        title: item.title,
        shopName: "ブランドオフ Yahoo!店",
        displayedPrice: item.price,
        url: item.url,
        listingCondition: "used",
        availabilityText: "",
      });
    }

    expect(YAHOO_SHOPPING_STORES.brandOff).toEqual({
      storeId: "brandoff",
      storeName: "ブランドオフ",
      channel: "yahoo-shopping",
      sellerId: "brandoff",
      categories: ["luxury_bags", "bags", "watches", "jewelry", "fashion", "shoes", "accessories"],
    });
    expect(observedStoreRequests).toHaveLength(3);
  }, 60_000);

  it("does not query BRAND OFF for PSP-3000 or Canon EOS profiles", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);
    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profiles = [
      { itemName: "Sony PSP-3000", version: "PSP-3000", priceSearchKeywordJa: "PSP-3000 本体 中古" },
      { itemName: "Canon EOS R5", version: "EOS R5", priceSearchKeywordJa: "Canon EOS R5 ボディ 中古" },
    ];

    for (const item of profiles) {
      const firstRequestIndex = fetchMock.mock.calls.length;
      const profile = toPriceItemProfile({ ...identification(), ...item });
      await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
      const brandOffRequests = fetchMock.mock.calls.slice(firstRequestIndex)
        .filter(([input]) => new URL(String(input)).searchParams.get("seller_id") === "brandoff");
      expect(brandOffRequests, item.itemName).toHaveLength(0);
    }
  }, 30_000);

  it("searches Map Camera once for Canon, NIKKOR, and FUJIFILM profiles", async () => {
    const hits = [
      {
        name: "Canon EOS R5 ボディ RFマウント 中古 Aランク",
        url: "https://store.shopping.yahoo.co.jp/ymapcamera/canon-eos-r5.html?from=all",
        code: "canon-eos-r5-body-rf-a",
        condition: "used",
        inStock: true,
        price: 398000,
      },
      {
        name: "Nikon NIKKOR Z 24-70mm f/2.8 S Zマウント 中古 ABランク",
        url: "https://store.shopping.yahoo.co.jp/ymapcamera/nikkor-z-24-70.html?from=all",
        code: "nikkor-z-24-70-f28-s-z-ab",
        condition: "used",
        inStock: true,
        price: 218000,
      },
      {
        name: "FUJIFILM X-T5 ボディ ブラック 中古 美品",
        url: "https://store.shopping.yahoo.co.jp/ymapcamera/fujifilm-x-t5.html?from=all",
        code: "fujifilm-x-t5-body-black",
        condition: "used",
        inStock: true,
        price: 198000,
      },
    ];
    const profiles = [
      { itemName: "Canon EOS R5", version: "EOS R5 body", priceSearchKeywordJa: "Canon EOS R5 ボディ RFマウント 中古", hitIndex: 0 },
      { itemName: "Nikon NIKKOR Z 24-70mm f/2.8 S", version: "Z mount", priceSearchKeywordJa: "Nikon NIKKOR Z 24-70mm f/2.8 S Zマウント 中古", hitIndex: 1 },
      { itemName: "FUJIFILM X-T5", version: "X-T5 body", priceSearchKeywordJa: "FUJIFILM X-T5 ボディ ブラック 中古", hitIndex: 2 },
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") !== "ymapcamera") return result([]);
      expect(url.searchParams.get("condition")).toBe("used");
      expect(url.searchParams.get("in_stock")).toBe("true");
      expect(url.searchParams.get("results")).toBe("30");
      const query = url.searchParams.get("query") ?? "";
      const profileIndex = profiles.findIndex(({ itemName }) => query.includes(itemName.split(" ")[0] ?? ""));
      const hit = hits[profileIndex >= 0 ? profileIndex : 0]!;
      const withSeller = { ...hit, seller: { name: "マップカメラ Yahoo!店", sellerId: "ymapcamera" } };
      return result([
        withSeller,
        { ...withSeller, url: `${new URL(withSeller.url).origin}${new URL(withSeller.url).pathname}?from=store` },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const observedSellerRequests: URL[] = [];
    for (const item of profiles) {
      const profile = toPriceItemProfile({ ...identification(), ...item });
      const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
      const sellerRequests = fetchMock.mock.calls
        .map(([input]) => new URL(String(input)))
        .filter((url) => url.searchParams.get("seller_id") === "ymapcamera");
      expect(sellerRequests).toHaveLength(observedSellerRequests.length + 1);
      observedSellerRequests.push(sellerRequests.at(-1)!);
      expect(snapshot.candidates).toHaveLength(1);
      expect(snapshot.candidates[0]).toMatchObject({
        source: "Yahoo! Shopping",
        title: hits[item.hitIndex]!.name,
        shopName: "マップカメラ Yahoo!店",
        displayedPrice: hits[item.hitIndex]!.price,
        url: hits[item.hitIndex]!.url,
        listingCondition: "used",
        availabilityText: "",
      });
    }

    expect(YAHOO_SHOPPING_STORES.mapCamera).toEqual({
      storeId: "ymapcamera",
      storeName: "マップカメラ",
      channel: "yahoo-shopping",
      sellerId: "ymapcamera",
      categories: ["cameras", "camera_lenses", "photography_equipment"],
    });
    expect(observedSellerRequests).toHaveLength(3);
  }, 45_000);

  it("does not query Map Camera for PSP gaming or Yohji fashion profiles", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);
    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profiles = [
      { itemName: "Sony PSP-3000", version: "PSP-3000", priceSearchKeywordJa: "PSP-3000 本体 中古" },
      { itemName: "Yohji Yamamoto POUR HOMME coat", version: "Vintage", priceSearchKeywordJa: "Yohji Yamamoto POUR HOMME vintage coat 古着" },
    ];

    for (const item of profiles) {
      const firstRequestIndex = fetchMock.mock.calls.length;
      const profile = toPriceItemProfile({ ...identification(), ...item });
      await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
      const mapCameraRequests = fetchMock.mock.calls.slice(firstRequestIndex)
        .filter(([input]) => new URL(String(input)).searchParams.get("seller_id") === "ymapcamera");
      expect(mapCameraRequests, item.itemName).toHaveLength(0);
    }
  }, 30_000);

  it("does not query Kitamura for luxury bags or PSP gaming profiles", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);
    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");

    for (const item of [
      { itemName: "CHANEL Classic Flap Bag", version: "Medium", priceSearchKeywordJa: "CHANEL マトラッセ バッグ 中古" },
      { itemName: "Sony PSP-3000", version: "PSP-3000", priceSearchKeywordJa: "PSP-3000 本体 中古" },
    ]) {
      const profile = toPriceItemProfile({ ...identification(), ...item });
      await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    }

    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("seller_id") === "emedama")).toBe(false);
  }, 15_000);

  it("does not make an extra KOMEHYO request for a gaming profile", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result(exactHits));
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile(identification());
    await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });

    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("seller_id") === "komehyo")).toBe(false);
    expect(fetchMock.mock.calls.filter(([input]) => new URL(String(input)).searchParams.get("seller_id") === "u-sofmap")).toHaveLength(1);
  });

  it("retains a valid full-site store listing when profile relevance skips its dedicated search", async () => {
    const listing = {
      name: "Sony PSP-3000 本体 中古",
      url: "https://store.shopping.yahoo.co.jp/komehyo/psp-3000.html?source=full",
      code: "psp-komehyo-001",
      condition: "used",
      inStock: true,
      price: 12000,
      seller: { name: "KOMEHYO Yahoo!店", sellerId: "komehyo" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const sellerId = new URL(String(input)).searchParams.get("seller_id");
      return sellerId ? result([]) : result([listing]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile(identification());
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });

    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("seller_id") === "komehyo")).toBe(false);
    expect(snapshot.candidates).toContainEqual(expect.objectContaining({
      source: "Yahoo! Shopping",
      title: listing.name,
      shopName: "KOMEHYO Yahoo!店",
      displayedPrice: 12000,
      url: listing.url,
    }));
  });

  it("searches RAGTAG for designer clothing, vintage Yohji, and used NIKE shoes", async () => {
    const profiles = [
      {
        itemName: "COMME des GARCONS PLAY cardigan",
        version: "PLAY heart logo",
        priceSearchKeywordJa: "COMME des GARCONS PLAY カーディガン 中古",
        title: "COMME des GARCONS PLAY ハートロゴ カーディガン 中古",
        code: "cdg-play-cardigan",
      },
      {
        itemName: "Yohji Yamamoto POUR HOMME coat",
        version: "Vintage",
        priceSearchKeywordJa: "Yohji Yamamoto POUR HOMME vintage coat 古着",
        title: "Yohji Yamamoto POUR HOMME 90s vintage coat 古着",
        code: "yohji-vintage-coat",
      },
      {
        itemName: "NIKE Air Max sneakers",
        version: "Air Max 90",
        priceSearchKeywordJa: "NIKE Air Max 90 スニーカー 中古",
        title: "NIKE Air Max 90 中古 スニーカー",
        code: "nike-air-max-90",
      },
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") !== "ragtagonlineshop") return result([]);
      expect(url.searchParams.get("condition")).toBe("used");
      expect(url.searchParams.get("in_stock")).toBe("true");
      expect(url.searchParams.get("results")).toBe("30");
      const profile = profiles.find(({ code }) => code === url.searchParams.get("query"));
      const index = Number(url.searchParams.get("query")?.split("-").at(-1));
      const matchingProfile = profiles.find(({ itemName }) => url.searchParams.get("query")?.includes(itemName.split(" ")[0] ?? ""));
      const selected = profile ?? matchingProfile ?? profiles[Math.min(index || 0, profiles.length - 1)]!;
      return result([{
        name: selected.title,
        url: `https://store.shopping.yahoo.co.jp/ragtagonlineshop/${selected.code}.html?source=store`,
        code: selected.code,
        condition: "used",
        inStock: true,
        price: 12000,
        seller: { name: "RAGTAG Yahoo!店", sellerId: "ragtagonlineshop" },
      }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const sellerRequests: URL[] = [];
    for (const item of profiles) {
      const profile = toPriceItemProfile({ ...identification(), ...item });
      const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
      const request = fetchMock.mock.calls
        .map(([input]) => new URL(String(input)))
        .findLast((url) => url.searchParams.get("seller_id") === "ragtagonlineshop");
      expect(request).toBeDefined();
      expect(snapshot.candidates.some(({ shopName, title }) => shopName === "RAGTAG Yahoo!店" && title === item.title)).toBe(true);
      if (request) sellerRequests.push(request);
    }

    expect(YAHOO_SHOPPING_STORES.ragtag).toEqual({
      storeId: "ragtagonlineshop",
      storeName: "RAGTAG",
      channel: "yahoo-shopping",
      sellerId: "ragtagonlineshop",
      categories: ["designer_fashion", "vintage_clothing", "shoes", "accessories", "bags"],
    });
    expect(sellerRequests).toHaveLength(3);
  }, 45_000);

  it("does not query RAGTAG for PSP-3000, Canon EOS, or vintage camera profiles", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);
    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profiles = [
      { itemName: "Sony PSP-3000", version: "PSP-3000", priceSearchKeywordJa: "PSP-3000 本体 中古" },
      { itemName: "Canon EOS R6 Mark II", version: "EOS R6 Mark II", priceSearchKeywordJa: "Canon EOS R6 Mark II ボディ 中古" },
      { itemName: "Nikon NIKKOR vintage lens", version: "NIKKOR 50mm", priceSearchKeywordJa: "Nikon NIKKOR vintage lens カメラ 中古" },
    ];

    for (const item of profiles) {
      const profile = toPriceItemProfile({ ...identification(), ...item });
      await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    }

    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("seller_id") === "ragtagonlineshop")).toBe(false);
  }, 45_000);

  it("deduplicates RAGTAG listings with query variants while retaining seller-specific candidates", async () => {
    const ragtagHit = {
      name: "COMME des GARCONS SHIRT wool coat size M 2000s vintage",
      url: "https://store.shopping.yahoo.co.jp/ragtagonlineshop/cdg-coat.html?ref=all",
      code: "cdg-coat-m-2000s",
      condition: "used",
      inStock: true,
      price: 44000,
      seller: { name: "RAGTAG Yahoo!店", sellerId: "ragtagonlineshop" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "ragtagonlineshop") {
        return result([
          ragtagHit,
          { ...ragtagHit, url: "https://store.shopping.yahoo.co.jp/ragtagonlineshop/cdg-coat.html?ref=store" },
        ]);
      }
      return result([ragtagHit]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "COMME des GARCONS SHIRT wool coat",
      version: "size M 2000s",
      priceSearchKeywordJa: "COMME des GARCONS SHIRT wool coat size M 2000s vintage 中古",
    });
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });

    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      title: ragtagHit.name,
      shopName: "RAGTAG Yahoo!店",
      displayedPrice: 44000,
      url: ragtagHit.url,
      listingCondition: "used",
      availabilityText: "",
    });
  }, 20_000);

  it("searches Kindal for designer fashion and keeps the original listing details", async () => {
    const kindalHit = {
      name: "COMME des GARCONS HOMME PLUS wool jacket size 3 2000s vintage",
      url: "https://store.shopping.yahoo.co.jp/kindal/cdg-homme-plus-jacket.html?from=all",
      code: "cdg-homme-plus-jacket-size-3",
      condition: "used",
      inStock: true,
      price: 38500,
      seller: { name: "カインドオル Yahoo!店", sellerId: "kindal" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("seller_id") === "kindal") {
        expect(url.searchParams.get("condition")).toBe("used");
        expect(url.searchParams.get("in_stock")).toBe("true");
        expect(url.searchParams.get("results")).toBe("30");
        return result([
          kindalHit,
          { ...kindalHit, url: "https://store.shopping.yahoo.co.jp/kindal/cdg-homme-plus-jacket.html?from=store" },
          { ...kindalHit, url: "https://store.shopping.yahoo.co.jp/kindal/wrong-seller.html", seller: { name: "Other seller", sellerId: "other" } },
          { ...kindalHit, url: "https://store.shopping.yahoo.co.jp/other/item.html" },
          { ...kindalHit, url: "https://store.shopping.yahoo.co.jp/kindal/sold.html", inStock: false },
          { ...kindalHit, url: "https://store.shopping.yahoo.co.jp/kindal/new.html", condition: "new" },
          { ...kindalHit, url: "https://store.shopping.yahoo.co.jp/kindal/no-price.html", price: 0 },
        ]);
      }
      return result([kindalHit]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { yahooShoppingProvider, YAHOO_SHOPPING_STORES } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profile = toPriceItemProfile({
      ...identification(),
      itemName: "COMME des GARCONS HOMME PLUS wool jacket",
      version: "size 3 2000s vintage",
      priceSearchKeywordJa: "COMME des GARCONS HOMME PLUS wool jacket size 3 2000s vintage 中古",
    });
    const snapshot = await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const storeRequests = requests.filter((url) => url.searchParams.get("seller_id") === "kindal");

    expect(YAHOO_SHOPPING_STORES.kindal).toEqual({
      storeId: "kindal",
      storeName: "カインドオル",
      channel: "yahoo-shopping",
      sellerId: "kindal",
      categories: ["designer_fashion", "vintage_clothing", "fashion", "shoes", "bags", "accessories"],
    });
    expect(storeRequests).toHaveLength(1);
    expect(storeRequests[0]?.searchParams.get("query")).toBe("COMME des GARCONS HOMME PLUS wool jacket size 3 2000s vintage");
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      source: "Yahoo! Shopping",
      title: kindalHit.name,
      shopName: "カインドオル Yahoo!店",
      displayedPrice: 38500,
      url: kindalHit.url,
      listingCondition: "used",
      availabilityText: "",
    });
  }, 30_000);

  it("does not make Kindal-specific requests for PSP or Canon camera profiles", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => result([]));
    vi.stubGlobal("fetch", fetchMock);
    const { yahooShoppingProvider } = await import("../src/server/providers/marketplaces/yahoo-shopping");
    const profiles = [
      { itemName: "Sony PSP-3000", version: "PSP-3000", priceSearchKeywordJa: "PSP-3000 本体 中古" },
      { itemName: "Canon EOS R6 Mark II", version: "EOS R6 Mark II", priceSearchKeywordJa: "Canon EOS R6 Mark II ボディ 中古" },
    ];

    for (const item of profiles) {
      const firstRequestIndex = fetchMock.mock.calls.length;
      const profile = toPriceItemProfile({ ...identification(), ...item });
      await yahooShoppingProvider.search({ profile, keyword: "ignored", maxCards: 30 });
      const kindalRequests = fetchMock.mock.calls.slice(firstRequestIndex)
        .filter(([input]) => new URL(String(input)).searchParams.get("seller_id") === "kindal");
      expect(kindalRequests, item.itemName).toHaveLength(0);
    }
  }, 30_000);

  it("keeps the API disabled in the registry unless explicitly opted in", async () => {
    delete process.env.YAHOO_SHOPPING_API_ENABLED;
    vi.resetModules();
    const { marketplaceRegistry } = await import("../src/server/providers/marketplaces/registry");
    const yahoo = marketplaceRegistry.find((entry) => entry.id === "Yahoo! Shopping");
    expect(yahoo?.status).toBe("disabled");
    expect(yahooE2eMocks.openBrowser).not.toHaveBeenCalled();
  });
});
