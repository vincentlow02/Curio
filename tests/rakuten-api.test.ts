import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRakutenItems, RAKUTEN_API_TIMEOUT_MS, RAKUTEN_ITEM_SEARCH_ENDPOINT, RakutenApiError, resetRakutenRateLimitForTests } from "../src/server/providers/marketplaces/rakuten-api-client";
import { mapRakutenItems } from "../src/server/providers/marketplaces/rakuten";
import type { RakutenApiItem } from "../src/server/providers/marketplaces/rakuten-api-client";
import { fixtureResult } from "../src/server/analysis/fixture-result";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";

const originalEnv = {
  applicationId: process.env.RAKUTEN_APPLICATION_ID,
  accessKey: process.env.RAKUTEN_ACCESS_KEY,
  apiEnabled: process.env.RAKUTEN_OFFICIAL_API_ENABLED,
  gatewayUrl: process.env.RAKUTEN_GATEWAY_URL,
  gatewayToken: process.env.RAKUTEN_GATEWAY_AUTH_TOKEN,
  gatewayServerToken: process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN,
};

beforeEach(() => {
  delete process.env.RAKUTEN_GATEWAY_URL;
  delete process.env.RAKUTEN_GATEWAY_AUTH_TOKEN;
  delete process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN;
});

afterEach(() => {
  if (originalEnv.applicationId === undefined) delete process.env.RAKUTEN_APPLICATION_ID;
  else process.env.RAKUTEN_APPLICATION_ID = originalEnv.applicationId;
  if (originalEnv.accessKey === undefined) delete process.env.RAKUTEN_ACCESS_KEY;
  else process.env.RAKUTEN_ACCESS_KEY = originalEnv.accessKey;
  if (originalEnv.apiEnabled === undefined) delete process.env.RAKUTEN_OFFICIAL_API_ENABLED;
  else process.env.RAKUTEN_OFFICIAL_API_ENABLED = originalEnv.apiEnabled;
  if (originalEnv.gatewayUrl === undefined) delete process.env.RAKUTEN_GATEWAY_URL;
  else process.env.RAKUTEN_GATEWAY_URL = originalEnv.gatewayUrl;
  if (originalEnv.gatewayToken === undefined) delete process.env.RAKUTEN_GATEWAY_AUTH_TOKEN;
  else process.env.RAKUTEN_GATEWAY_AUTH_TOKEN = originalEnv.gatewayToken;
  if (originalEnv.gatewayServerToken === undefined) delete process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN;
  else process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN = originalEnv.gatewayServerToken;
  vi.useRealTimers();
  resetRakutenRateLimitForTests();
  vi.resetModules();
});

function setCredentials(): void {
  process.env.RAKUTEN_APPLICATION_ID = "mock-application-id";
  process.env.RAKUTEN_ACCESS_KEY = "mock-access-key-never-log";
}

function response(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

describe("Rakuten Ichiba Item Search API client", () => {
  it("sends the 2026-07-01 V2 request with Japanese query and access key only in the header", async () => {
    setCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ items: [] }));
    const result = await fetchRakutenItems("中古 リザードン", { fetchImpl, rateLimit: async () => undefined });
    const [input, init] = fetchImpl.mock.calls[0]!;
    const requestUrl = new URL(String(input));
    const headers = new Headers(init?.headers);

    expect(result.items).toEqual([]);
    expect(requestUrl.origin + requestUrl.pathname).toBe(RAKUTEN_ITEM_SEARCH_ENDPOINT);
    expect(requestUrl.searchParams.get("applicationId")).toBe("mock-application-id");
    expect(requestUrl.searchParams.get("keyword")).toBe("中古 リザードン");
    expect(requestUrl.searchParams.get("format")).toBe("json");
    expect(requestUrl.searchParams.get("formatVersion")).toBe("2");
    expect(requestUrl.searchParams.get("hits")).toBe("30");
    expect(requestUrl.searchParams.get("page")).toBe("1");
    expect(requestUrl.searchParams.get("availability")).toBe("1");
    expect(headers.get("accessKey")).toBe("mock-access-key-never-log");
    expect(requestUrl.searchParams.has("accessKey")).toBe(false);
    expect(String(input)).not.toContain("mock-access-key-never-log");
    expect((init?.signal as AbortSignal).aborted).toBe(false);
    expect(RAKUTEN_API_TIMEOUT_MS).toBe(10_000);
  });

  it.each([
    ["lowercase direct items", (product: Record<string, unknown>) => ({ items: [product] })],
    ["uppercase direct Items", (product: Record<string, unknown>) => ({ Items: [product] })],
    ["lowercase nested item", (product: Record<string, unknown>) => ({ items: [{ item: product }] })],
    ["uppercase nested Item", (product: Record<string, unknown>) => ({ Items: [{ Item: product }] })],
  ])("normalizes %s into RakutenApiResponse.items", async (_label, envelope) => {
    setCredentials();
    const product = {
      itemName: "中古 PSP-3000 本体",
      itemPrice: 12000,
      itemUrl: "https://item.rakuten.co.jp/shop/psp-3000",
      availability: 1,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(envelope(product)));

    const result = await fetchRakutenItems("PSP-3000 本体", {
      fetchImpl,
      rateLimit: async () => undefined,
    });

    expect(result.items).toEqual([product]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("flattens mixed direct and nested products while preserving API order", async () => {
    setCredentials();
    const first = { itemName: "PSP-3000 本体 A", itemUrl: "https://item.rakuten.co.jp/shop/a", itemPrice: 10000 };
    const second = { itemName: "PSP-3000 本体 B", itemUrl: "https://item.rakuten.co.jp/shop/b", itemPrice: 11000 };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ Items: [first, { Item: second }] }));

    const result = await fetchRakutenItems("PSP-3000 本体", {
      fetchImpl,
      rateLimit: async () => undefined,
    });

    expect(result.items).toEqual([first, second]);
  });

  it("normalizes the real uppercase Items format and numeric genreId", async () => {
    setCredentials();
    const product = {
      itemName: "中古 PSP-3000 本体",
      itemPrice: 12000,
      itemUrl: "https://item.rakuten.co.jp/shop/psp-3000",
      genreId: 12345,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ Items: [product] }));

    const result = await fetchRakutenItems("PSP-3000 本体", {
      fetchImpl,
      rateLimit: async () => undefined,
    });

    expect(result.items).toEqual([{ ...product, genreId: "12345" }]);
  });

  it("maps five V2 listings without changing API order or the Candidate contract", () => {
    const items: RakutenApiItem[] = [
      { itemName: "中古 ゲームボーイアドバンス", itemCode: "shop:a", itemPrice: 9800, itemUrl: "https://item.rakuten.co.jp/shop/a", availability: 1, shopName: "Shop A", mediumImageUrls: [{ imageUrl: "https://thumbnail.image.rakuten.co.jp/@0_mall/shop/cabinet/item.jpg" }] },
      { itemName: "中古 PSP-3000 ブラック", itemCode: "shop:b", itemPrice: 12500, itemUrl: "https://item.rakuten.co.jp/shop/b", availability: 0, shopName: "Shop B" },
      { itemName: "中古 レコード", itemCode: "shop:c", itemPrice: 0, itemUrl: "https://item.rakuten.co.jp/shop/c", shopName: "Shop C" },
      { itemName: "中古 フィギュア", itemCode: "shop:d", itemPrice: "invalid", itemUrl: "https://item.rakuten.co.jp/shop/d", availability: 1 },
      { itemName: "中古 ポケモンカード", itemCode: "shop:e", itemPrice: 3100, itemUrl: "https://item.rakuten.co.jp/shop/e", availability: 7, shopName: " Shop E " },
    ];

    const candidates = mapRakutenItems(items);

    expect(candidates).toEqual([
      { source: "Rakuten", rank: 1, title: "中古 ゲームボーイアドバンス", displayedPrice: 9800, url: "https://item.rakuten.co.jp/shop/a", shopName: "Shop A", availabilityText: "", imageUrl: "https://thumbnail.image.rakuten.co.jp/@0_mall/shop/cabinet/item.jpg" },
      { source: "Rakuten", rank: 2, title: "中古 PSP-3000 ブラック", displayedPrice: 12500, url: "https://item.rakuten.co.jp/shop/b", shopName: "Shop B", availabilityText: "在庫なし" },
      { source: "Rakuten", rank: 3, title: "中古 レコード", displayedPrice: 0, url: "https://item.rakuten.co.jp/shop/c", shopName: "Shop C", availabilityText: "unknown" },
      { source: "Rakuten", rank: 4, title: "中古 フィギュア", displayedPrice: null, url: "https://item.rakuten.co.jp/shop/d", shopName: "unknown", availabilityText: "" },
      { source: "Rakuten", rank: 5, title: "中古 ポケモンカード", displayedPrice: 3100, url: "https://item.rakuten.co.jp/shop/e", shopName: "Shop E", availabilityText: "unknown" },
    ]);
  });

  it("uses only safe HTTPS images from medium then small image fields", () => {
    const candidates = mapRakutenItems([
      {
        itemName: "Listing with fallback image",
        itemPrice: 1000,
        itemUrl: "https://item.rakuten.co.jp/shop/item",
        mediumImageUrls: [{ imageUrl: "http://invalid.example/image.jpg" }],
        smallImageUrls: [{ imageUrl: "https://images.example/image.jpg" }],
      },
      {
        itemName: "Listing with invalid image",
        itemPrice: 2000,
        itemUrl: "https://item.rakuten.co.jp/shop/item-2",
        mediumImageUrls: [{ imageUrl: "https://user:pass@images.example/private.jpg" }],
        smallImageUrls: [{ imageUrl: "javascript:alert(1)" }],
      },
    ]);

    expect(candidates[0]?.imageUrl).toBe("https://images.example/image.jpg");
    expect(candidates[1]).not.toHaveProperty("imageUrl");
  });

  it("uses the configured HTTPS Gateway without requiring Rakuten credentials", async () => {
    delete process.env.RAKUTEN_APPLICATION_ID;
    delete process.env.RAKUTEN_ACCESS_KEY;
    process.env.RAKUTEN_OFFICIAL_API_ENABLED = "true";
    process.env.RAKUTEN_GATEWAY_URL = "https://rakuten-gateway.example";
    process.env.RAKUTEN_GATEWAY_AUTH_TOKEN = "gateway-test-token-with-at-least-32-bytes";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ items: [] }));

    const result = await fetchRakutenItems("PSP-3000 本体", { fetchImpl });
    const [input, init] = fetchImpl.mock.calls[0]!;
    const requestUrl = new URL(String(input));
    const headers = new Headers(init?.headers);

    expect(result.items).toEqual([]);
    expect(requestUrl.origin).toBe("https://rakuten-gateway.example");
    expect(requestUrl.pathname).toBe("/internal/rakuten/search");
    expect(requestUrl.search).toBe("");
    expect(init?.method).toBe("POST");
    expect(headers.get("authorization")).toBe("Bearer gateway-test-token-with-at-least-32-bytes");
    expect(headers.has("accessKey")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({ keyword: "PSP-3000 本体" });
    expect(init?.redirect).toBe("manual");
    expect((init?.signal as AbortSignal).aborted).toBe(false);
  });

  it("uses direct Rakuten when the VPS has only Gateway server-auth and Rakuten credentials", async () => {
    setCredentials();
    process.env.RAKUTEN_OFFICIAL_API_ENABLED = "true";
    process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN = "vps-inbound-test-token-with-at-least-32-bytes";
    delete process.env.RAKUTEN_GATEWAY_URL;
    delete process.env.RAKUTEN_GATEWAY_AUTH_TOKEN;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ items: [] }));

    const result = await fetchRakutenItems("PSP-3000 本体", { fetchImpl });
    const [input, init] = fetchImpl.mock.calls[0]!;
    const requestUrl = new URL(String(input));
    const headers = new Headers(init?.headers);

    expect(result.items).toEqual([]);
    expect(requestUrl.origin + requestUrl.pathname).toBe(RAKUTEN_ITEM_SEARCH_ENDPOINT);
    expect(requestUrl.searchParams.get("applicationId")).toBe("mock-application-id");
    expect(headers.get("accessKey")).toBe("mock-access-key-never-log");
    expect(init?.method).toBe("GET");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not fall back to direct Rakuten when Gateway configuration is incomplete", async () => {
    setCredentials();
    process.env.RAKUTEN_GATEWAY_URL = "https://rakuten-gateway.example";
    delete process.env.RAKUTEN_GATEWAY_AUTH_TOKEN;
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(fetchRakutenItems("PSP-3000", { fetchImpl })).rejects.toMatchObject({ kind: "configuration_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS Gateway origins before making a request", async () => {
    process.env.RAKUTEN_GATEWAY_URL = "http://rakuten-gateway.example";
    process.env.RAKUTEN_GATEWAY_AUTH_TOKEN = "gateway-test-token-with-at-least-32-bytes";
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(fetchRakutenItems("PSP-3000", { fetchImpl })).rejects.toMatchObject({ kind: "configuration_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("filters invalid rows, duplicate URLs, and results beyond the requested bounded count", () => {
    const items = [
      ...Array.from({ length: 35 }, (_, index) => ({ itemName: `Listing ${index + 1}`, itemPrice: 100 + index, itemUrl: `https://item.rakuten.co.jp/shop/${index + 1}` })),
      { itemName: "Duplicate URL", itemPrice: 200, itemUrl: "https://item.rakuten.co.jp/shop/1" },
      { itemName: "No URL", itemPrice: 300, itemUrl: "javascript:alert(1)" },
    ];

    const candidates = mapRakutenItems(items, 100);

    expect(candidates).toHaveLength(30);
    expect(candidates[0]?.rank).toBe(1);
    expect(candidates.at(-1)?.rank).toBe(30);
    expect(candidates.some(({ url }) => url.startsWith("javascript:"))).toBe(false);
  });

  it("returns distinct safe errors for missing credentials and invalid queries", async () => {
    delete process.env.RAKUTEN_APPLICATION_ID;
    delete process.env.RAKUTEN_ACCESS_KEY;
    await expect(fetchRakutenItems("商品", { rateLimit: async () => undefined })).rejects.toMatchObject({ kind: "configuration_error" });
    setCredentials();
    await expect(fetchRakutenItems("   ", { rateLimit: async () => undefined })).rejects.toMatchObject({ kind: "invalid_query" });
    await expect(fetchRakutenItems("あ".repeat(65), { rateLimit: async () => undefined })).rejects.toMatchObject({ kind: "invalid_query" });
  });

  it.each([401, 403])("classifies HTTP %i as an authentication error without exposing credentials", async (status) => {
    setCredentials();
    await expect(fetchRakutenItems("商品", { fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response({}, status)), rateLimit: async () => undefined }))
      .rejects.toMatchObject({ kind: "auth_error" });
  });

  it("handles HTTP 429 without retry and retains numeric Retry-After", async () => {
    setCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({}, 429, { "Retry-After": "17" }));
    let error: unknown;
    try {
      await fetchRakutenItems("商品", { fetchImpl, rateLimit: async () => undefined });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RakutenApiError);
    expect(error).toMatchObject({ kind: "rate_limited", retryAfterSeconds: 17 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("spaces concurrent requests at least one second apart in this process", async () => {
    setCredentials();
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [] }),
    } as Response);
    const first = fetchRakutenItems("商品 A", { fetchImpl });
    await first;
    const second = fetchRakutenItems("商品 B", { fetchImpl });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([500, 503])("classifies HTTP %i as an upstream error", async (status) => {
    setCredentials();
    await expect(fetchRakutenItems("商品", { fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response({}, status)), rateLimit: async () => undefined }))
      .rejects.toMatchObject({ kind: "upstream_error" });
  });

  it("rejects malformed JSON, envelopes and product fields rather than returning empty results", async () => {
    setCredentials();
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 200 }));
    await expect(fetchRakutenItems("商品", { fetchImpl: malformed, rateLimit: async () => undefined })).rejects.toMatchObject({ kind: "invalid_response" });

    const validProduct = { itemName: "Listing", itemUrl: "https://item.rakuten.co.jp/shop/item", itemPrice: 1000 };
    const invalidPayloads: unknown[] = [
      {},
      { items: [], Items: [] },
      { items: {} },
      { Items: [null] },
      { items: [{ Item: "not-an-object" }] },
      { items: [{ itemUrl: "https://item.rakuten.co.jp/shop/item" }] },
      { items: [{ itemName: "Listing" }] },
      { items: [{ ...validProduct, itemPrice: { amount: 1000 } }] },
      { items: [{ ...validProduct, mediumImageUrls: [{ imageUrl: 42 }] }] },
      { items: [{ ...validProduct, genreId: true }] },
      { items: [{ ...validProduct, genreId: -1 }] },
      { items: [{ ...validProduct, genreId: Number.MAX_SAFE_INTEGER + 1 }] },
    ];

    for (const payload of invalidPayloads) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(payload));
      await expect(fetchRakutenItems("商品", { fetchImpl, rateLimit: async () => undefined }))
        .rejects.toMatchObject({ kind: "invalid_response" });
    }
  });

  it("classifies timeout and caller cancellation without logging or returning secrets", async () => {
    setCredentials();
    const timeoutFetch = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    await expect(fetchRakutenItems("商品", { fetchImpl: timeoutFetch, rateLimit: async () => undefined })).rejects.toMatchObject({ kind: "timeout" });

    const controller = new AbortController();
    controller.abort(new Error("request canceled"));
    await expect(fetchRakutenItems("商品", { signal: controller.signal, rateLimit: async () => undefined })).rejects.toThrow("request canceled");
  });
});

describe("Rakuten Provider feature flag", () => {
  it("keeps the Browser rollback Provider selected unless explicitly enabled", async () => {
    delete process.env.RAKUTEN_OFFICIAL_API_ENABLED;
    vi.resetModules();
    const defaultRegistry = await import("../src/server/providers/marketplaces/registry");
    expect(defaultRegistry.marketplaceRegistry[0]?.provider.runtime).toBe("browser");

    process.env.RAKUTEN_OFFICIAL_API_ENABLED = "true";
    vi.resetModules();
    const apiRegistry = await import("../src/server/providers/marketplaces/registry");
    expect(apiRegistry.marketplaceRegistry[0]?.provider.runtime).toBe("http");
    expect(apiRegistry.marketplaceRegistry[0]?.provider.source).toBe("Rakuten");
  }, 15_000);

  it("runs the enabled Rakuten API with Mercari Browser using one shared context", async () => {
    process.env.RAKUTEN_APPLICATION_ID = "mock-application-id";
    process.env.RAKUTEN_ACCESS_KEY = "mock-access-key-never-log";
    process.env.RAKUTEN_OFFICIAL_API_ENABLED = "true";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response({ items: [] })));
    vi.resetModules();

    const { coordinateMarketplaceSearches } = await import("../src/server/providers/marketplaces/coordinator");
    const page = {
      async goto() {},
      async waitForSelector() { throw new Error("Empty Mercari results"); },
      async evaluate() { return []; },
      async close() {},
    };
    const context = { newPage: vi.fn(async () => page) };
    const getBrowserContext = vi.fn(async () => context as never);
    const fixture = fixtureResult({ collectorMode: false });

    const coordinated = await coordinateMarketplaceSearches({
      profile: toPriceItemProfile(fixture.identification),
      keyword: fixture.identification.priceSearchKeywordJa,
      maxCardsPerSource: 30,
      getBrowserContext,
    });

    expect(coordinated.snapshot.sources.map(({ source }) => source)).toEqual(["Rakuten", "Mercari"]);
    expect(coordinated.snapshot.sources[0]).toMatchObject({ error: null, candidates: [] });
    expect(coordinated.snapshot.sources[1]).toMatchObject({ error: null, candidates: [] });
    expect(fetch).toHaveBeenCalledOnce();
    expect(getBrowserContext).toHaveBeenCalledOnce();
    expect(context.newPage).toHaveBeenCalledOnce();
  });

  it("does not invoke the Browser rollback Provider after an API error", async () => {
    process.env.RAKUTEN_APPLICATION_ID = "mock-application-id";
    process.env.RAKUTEN_ACCESS_KEY = "mock-access-key-never-log";
    process.env.RAKUTEN_OFFICIAL_API_ENABLED = "true";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response({ error: "system_error" }, 503)));
    vi.resetModules();

    const { coordinateMarketplaceSearches } = await import("../src/server/providers/marketplaces/coordinator");
    const page = {
      async goto() {},
      async waitForSelector() { throw new Error("Empty Mercari results"); },
      async evaluate() { return []; },
      async close() {},
    };
    const context = { newPage: vi.fn(async () => page) };
    const getBrowserContext = vi.fn(async () => context as never);
    const fixture = fixtureResult({ collectorMode: false });

    const coordinated = await coordinateMarketplaceSearches({
      profile: toPriceItemProfile(fixture.identification),
      keyword: fixture.identification.priceSearchKeywordJa,
      maxCardsPerSource: 30,
      getBrowserContext,
    });

    expect(coordinated.snapshot.sources[0]).toMatchObject({ source: "Rakuten", error: expect.stringContaining("upstream_error"), candidates: [] });
    expect(coordinated.snapshot.sources[1]).toMatchObject({ source: "Mercari", error: null, candidates: [] });
    expect(fetch).toHaveBeenCalledOnce();
    expect(getBrowserContext).toHaveBeenCalledOnce();
    expect(context.newPage).toHaveBeenCalledOnce();
  });
});