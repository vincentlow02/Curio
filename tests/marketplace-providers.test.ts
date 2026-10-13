import { describe, expect, it } from "vitest";

import { fixtureResult } from "../src/server/analysis/fixture-result";
import { MARKETPLACE_IDS, MARKETPLACE_METADATA, MARKETPLACE_SOURCE_IDS } from "../src/core/marketplace";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { buildPriceResult } from "../src/price/matcher";
import { disabledStoreSnapshot } from "../src/price/store-verifier";
import { disabledTavilyFallback } from "../src/price/tavily-price-fallback";
import { coordinateMarketplaceSearches, deduplicateYahooStoreListings } from "../src/server/providers/marketplaces/coordinator";
import { marketplaceRegistry } from "../src/server/providers/marketplaces/registry";
import { selectMarketplaceProviders } from "../src/server/providers/marketplaces/selector";
import { buildMercariKeyword, mercariProvider } from "../src/server/providers/marketplaces/mercari";
import { buildMarketplaceKeyword } from "../src/server/providers/marketplaces/shared/keyword";
import type { MarketplaceCandidate } from "../src/price/types";

describe("marketplace provider registry", () => {
  it("keeps source IDs and metadata keys aligned", () => {
    expect(MARKETPLACE_SOURCE_IDS).toEqual(Object.values(MARKETPLACE_IDS));
    expect(Object.keys(MARKETPLACE_METADATA)).toEqual([...MARKETPLACE_SOURCE_IDS]);
  });

  it("selects only the existing Rakuten and Mercari providers in their current order", () => {
    const fixture = fixtureResult({ collectorMode: false });
    const profile = toPriceItemProfile(fixture.identification);

    expect(selectMarketplaceProviders(profile).map((provider) => provider.source)).toEqual(["Rakuten", "Mercari"]);
    expect(marketplaceRegistry.filter((entry) => entry.status === "disabled").map((entry) => entry.id)).toEqual([
      "Yahoo! Shopping", "Yahoo!フリマ", "Rakuma", "Surugaya Yahoo Store", "Surugaya", "BOOKOFF", "HARD OFF", "2nd STREET", "Yahoo! Auctions", "Mandarake",
    ]);
  });

  it("deduplicates the same Yahoo store item across the API and Surugaya providers", () => {
    const yahooCandidate: MarketplaceCandidate = {
      source: MARKETPLACE_IDS.yahooShopping,
      rank: 1,
      title: "中古 PSP-3000",
      displayedPrice: 12000,
      url: "https://store.shopping.yahoo.co.jp/suruga-ya/177011991001.html?tracking=api",
      shopName: "駿河屋",
      availabilityText: "",
      listingCondition: "used",
    };
    const surugayaCandidate: MarketplaceCandidate = { ...yahooCandidate, source: MARKETPLACE_IDS.surugayaYahooStore };
    const sources = deduplicateYahooStoreListings([
      { source: MARKETPLACE_IDS.yahooShopping, keyword: "psp", searchUrl: "api", error: null, candidates: [yahooCandidate] },
      {
        source: MARKETPLACE_IDS.surugayaYahooStore,
        keyword: "psp",
        searchUrl: "store",
        error: null,
        candidates: [surugayaCandidate],
        diagnostics: [{ kind: "listing_discovery", listings: [{ title: surugayaCandidate.title, price: 12000, url: surugayaCandidate.url, availability: "IN_STOCK" }] }],
      },
    ]);

    expect(sources[0]?.candidates).toHaveLength(1);
    expect(sources[1]?.candidates).toHaveLength(0);
    expect(sources[1]?.diagnostics?.[0]?.listings).toEqual([]);
  });

  it("keeps a stock-confirmed store listing when the same API item is unpriced or availability-unknown", () => {
    const apiCandidate: MarketplaceCandidate = {
      source: MARKETPLACE_IDS.yahooShopping,
      rank: 1,
      title: "中古 PSP-3000",
      displayedPrice: null,
      url: "https://store.shopping.yahoo.co.jp/suruga-ya/177011991001.html?tracking=api",
      shopName: "駿河屋",
      availabilityText: "unknown",
      listingCondition: "used",
    };
    const storeCandidate: MarketplaceCandidate = {
      ...apiCandidate,
      source: MARKETPLACE_IDS.surugayaYahooStore,
      displayedPrice: 12000,
      availabilityText: "",
    };
    const sources = deduplicateYahooStoreListings([
      { source: MARKETPLACE_IDS.yahooShopping, keyword: "psp", searchUrl: "api", error: null, candidates: [apiCandidate] },
      { source: MARKETPLACE_IDS.surugayaYahooStore, keyword: "psp", searchUrl: "store", error: null, candidates: [storeCandidate] },
    ]);

    expect(sources[1]?.candidates).toEqual([storeCandidate]);
  });

  it("preserves normalized queries, source ordering, and SearchSnapshot candidate data", async () => {
    const fixture = fixtureResult({ collectorMode: false });
    const profile = toPriceItemProfile(fixture.identification);
    const keyword = '中古 "ポケモンカード151 リザードン"';
    const rakutenCandidate: MarketplaceCandidate = {
      source: "Rakuten", rank: 1, title: "中古 リザードン", displayedPrice: 12000,
      url: "https://item.rakuten.co.jp/shop/item", shopName: "shop", availabilityText: "",
    };
    const mercariCandidate: MarketplaceCandidate = {
      source: "Mercari", rank: 1, title: "リザードン", displayedPrice: 11000,
      url: "https://jp.mercari.com/item/example", shopName: "individual_seller", imageUrl: null,
      availabilityText: "", listingCondition: "unknown", availabilityStatus: "unknown",
    };
    const candidates = [[rakutenCandidate], [mercariCandidate]];
    const visited: string[] = [];
    let activePages = 0;
    let maxActivePages = 0;
    let pageIndex = 0;
    const context = {
      async newPage() {
        const index = pageIndex++;
        activePages += 1;
        maxActivePages = Math.max(maxActivePages, activePages);
        return {
          async goto(url: string) { visited.push(url); },
          async waitForSelector() {},
          async evaluate() { return candidates[index]; },
          async close() { activePages -= 1; },
        };
      },
    };

    const coordinated = await coordinateMarketplaceSearches({
      profile,
      keyword,
      maxCardsPerSource: 30,
      maxConcurrentProviders: 1,
      getBrowserContext: async () => context as never,
    });

    expect(coordinated.snapshot.sources.map(({ source }) => source)).toEqual(["Rakuten", "Mercari"]);
    expect(coordinated.snapshot.sources.map(({ keyword: normalized }) => normalized)).toEqual([
      '中古 ポケモンカード151 リザードン',
      'ポケモンカード151 リザードン',
    ]);
    expect(coordinated.snapshot.sources.map(({ candidates: found }) => found)).toEqual(candidates);
    expect(coordinated.snapshot.sources.every(({ error }) => error === null)).toBe(true);
    expect(Object.keys(coordinated.durationMsBySource)).toEqual(["Rakuten", "Mercari"]);
    expect(maxActivePages).toBe(1);
    expect(activePages).toBe(0);
    expect(visited[0]).toMatch(/^https:\/\/search\.rakuten\.co\.jp\/search\/mall\//);
    expect(visited[1]).toContain("https://jp.mercari.com/search?keyword=");
    expect(visited[1]).toContain("&status=on_sale");
    expect(buildMarketplaceKeyword('「QUINTET」 五重奏団')).toBe("");
    expect(buildMercariKeyword('中古 “リザードン”')).toBe("リザードン");
  });

  it("extracts Mercari candidates from the page response payload before falling back to the DOM", async () => {
    let resolvePayload!: (payload: { items: Array<Record<string, unknown>> }) => void;
    let markJsonStarted!: () => void;
    const payloadPromise = new Promise<{ items: Array<Record<string, unknown>> }>((resolve) => { resolvePayload = resolve; });
    const jsonStarted = new Promise<void>((resolve) => { markJsonStarted = resolve; });
    let responseWaiterInstalled = false;
    let fallbackWaits = 0;
    const response = {
      url: () => "https://api.mercari.jp/v2/entities?keyword=リザードン",
      request: () => ({ method: () => "POST" }),
      json: () => { markJsonStarted(); return payloadPromise; },
    };
    const page = {
      async goto() {
        expect(responseWaiterInstalled).toBe(true);
      },
      async waitForResponse(predicate: (value: typeof response) => boolean) {
        responseWaiterInstalled = true;
        expect(predicate(response)).toBe(true);
        return response;
      },
      async waitForSelector() {
        fallbackWaits += 1;
        return undefined;
      },
      async evaluate() {
        return [];
      },
      async close() {
        return undefined;
      },
    };

    const context = {
      async newPage() {
        return page as never;
      },
    };

    const fixture = fixtureResult({ collectorMode: false });
    const resultPromise = mercariProvider.searchWithBrowser({
      context: context as never,
      profile: toPriceItemProfile(fixture.identification),
      keyword: "リザードン",
      maxCards: 5,
    });
    let searchFinished = false;
    void resultPromise.then(() => { searchFinished = true; });
    await jsonStarted;
    await Promise.resolve();
    expect(searchFinished).toBe(false);
    expect(fallbackWaits).toBe(0);
    resolvePayload({
      items: [
        { id: 123, name: "リザードン", price: 12000, status: "ITEM_STATUS_ON_SALE", itemType: "ITEM_TYPE_MERCARI" },
        { id: 456, name: "ポケモンカード リザードン", price: 999, status: "ITEM_STATUS_ON_SALE", itemType: "ITEM_TYPE_MERCARI" },
      ],
    });
    const result = await resultPromise;

    expect(fallbackWaits).toBe(0);
    expect(result.candidates.map(({ title }) => title)).toEqual(["リザードン", "ポケモンカード リザードン"]);
    expect(result.candidates.map(({ displayedPrice }) => displayedPrice)).toEqual([12000, 999]);
    expect(result.candidates.map(({ imageUrl, listingCondition, availabilityStatus }) => ({ imageUrl, listingCondition, availabilityStatus }))).toEqual([
      { imageUrl: null, listingCondition: "unknown", availabilityStatus: "available" },
      { imageUrl: null, listingCondition: "unknown", availabilityStatus: "available" },
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ source: "api_response" })]));
  });

  it("extracts Mercari titles from card labels, alt text, link labels, title attributes, then text", async () => {
    const makeAttribute = (attribute: string, value: string) => ({ getAttribute: (name: string) => name === attribute ? value : null });
    const fixtureCards = [
      { title: "Sony PSP-3000 from role label", role: "Sony PSP-3000 from role label", alt: "lower priority alt", imageUrl: "https://static.mercdn.net/item/detail/orig/photos/example.jpg", linkLabel: "lower priority link", titleAttribute: "lower priority title", text: "¥12,000" },
      { title: "Sony PSP-3000 from image alt", alt: "Sony PSP-3000 from image alt", linkLabel: "lower priority link", titleAttribute: "lower priority title", text: "¥13,000" },
      { title: "Sony PSP-3000 from link label", linkLabel: "Sony PSP-3000 from link label", titleAttribute: "lower priority title", text: "¥14,000" },
      { title: "Sony PSP-3000 from title attribute", titleAttribute: "Sony PSP-3000 from title attribute", text: "¥15,000" },
      { title: "Sony PSP-3000 from card text", text: "Sony PSP-3000 from card text ¥16,000" },
    ];
    const anchors = fixtureCards.map((fixture, index) => {
      const attributes: Record<string, string> = { href: `/item/fixture-${index}` };
      const values: Record<string, { getAttribute: (name: string) => string | null }> = {};
      if (fixture.role) values['[role="img"][aria-label]'] = makeAttribute("aria-label", fixture.role);
      if (fixture.alt) values["img[alt]"] = makeAttribute("alt", fixture.alt);
      if (fixture.imageUrl) values.img = { currentSrc: fixture.imageUrl, src: fixture.imageUrl, getAttribute: (name: string) => name === "src" ? fixture.imageUrl! : null };
      if (fixture.linkLabel) attributes["aria-label"] = fixture.linkLabel;
      if (fixture.titleAttribute) values["[title]"] = makeAttribute("title", fixture.titleAttribute);
      const card = {
        innerText: fixture.text,
        parentElement: null,
        querySelector: (selector: string) => values[selector] ?? null,
      };
      return {
        href: `https://jp.mercari.com/item/fixture-${index}`,
        textContent: fixture.text,
        parentElement: card,
        getAttribute: (name: string) => attributes[name] ?? null,
        querySelector: (selector: string) => values[selector] ?? null,
      };
    });
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { querySelectorAll: () => anchors },
    });
    const visited: string[] = [];
    const context = {
      async newPage() {
        return {
          async goto(url: string) { visited.push(url); },
          async waitForSelector() {},
          async evaluate<T, A>(callback: (argument: A) => T, argument: A) { return callback(argument); },
          async close() {},
        };
      },
    };

    try {
      const fixture = fixtureResult({ collectorMode: false });
      const result = await mercariProvider.searchWithBrowser({
        context: context as never,
        profile: toPriceItemProfile(fixture.identification),
        keyword: "Sony PSP-3000",
        maxCards: 5,
      });
      expect(result.candidates.map(({ title }) => title)).toEqual(fixtureCards.map(({ title }) => title));
      expect(result.candidates.map(({ displayedPrice }) => displayedPrice)).toEqual([12000, 13000, 14000, 15000, 16000]);
      expect(result.candidates.map(({ url }) => url)).toEqual(anchors.map(({ href }) => href));
      expect(result.candidates.map(({ imageUrl, listingCondition, availabilityStatus }) => ({ imageUrl, listingCondition, availabilityStatus }))).toEqual([
        { imageUrl: "https://static.mercdn.net/item/detail/orig/photos/example.jpg", listingCondition: "unknown", availabilityStatus: "unknown" },
        ...fixtureCards.slice(1).map(() => ({ imageUrl: null, listingCondition: "unknown", availabilityStatus: "unknown" })),
      ]);
      expect(visited).toHaveLength(1);
      expect(visited[0]).toContain("jp.mercari.com/search?");
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

  it("keeps legacy candidates compatible and does not confuse unknown availability with sold-out", () => {
    const fixture = fixtureResult({ collectorMode: false });
    const profile = toPriceItemProfile(fixture.identification);
    const base: MarketplaceCandidate = {
      source: MARKETPLACE_IDS.mercari,
      rank: 1,
      title: "中古 PSP-3000 本体 A",
      displayedPrice: 10000,
      url: "https://jp.mercari.com/item/a",
      shopName: "individual_seller",
      availabilityText: "",
    };
    const legacyCandidate = { ...base, rank: 1, url: "https://jp.mercari.com/item/legacy" };
    const unknownCandidate = { ...base, rank: 2, title: "中古 PSP-3000 本体 B", url: "https://jp.mercari.com/item/unknown", availabilityStatus: "unknown" as const };
    const soldOutCandidate = { ...base, rank: 3, title: "中古 PSP-3000 本体 C", url: "https://jp.mercari.com/item/sold", availabilityStatus: "sold_out" as const };
    const result = buildPriceResult({
      profile,
      snapshot: { version: 2, capturedAt: "fixture", sources: [{ source: MARKETPLACE_IDS.mercari, keyword: "PSP-3000", searchUrl: "https://jp.mercari.com/search", error: null, candidates: [legacyCandidate, unknownCandidate, soldOutCandidate] }] },
      tavilyFallback: disabledTavilyFallback(profile),
      storeSnapshot: disabledStoreSnapshot(),
      maxCardsScannedPerSource: 30,
      maxSamplesPerSource: 5,
    });

    expect(result.result.samples.map(({ rank, listingStatus }) => ({ rank, listingStatus }))).toEqual([
      { rank: 1, listingStatus: "active" },
      { rank: 2, listingStatus: "unknown" },
    ]);
    expect(result.excluded).toContainEqual({ source: MARKETPLACE_IDS.mercari, rank: 3, url: "https://jp.mercari.com/item/sold", reason: "sold_out" });
    expect(result.result.referenceRange.sampleCount).toBe(2);
  });
});