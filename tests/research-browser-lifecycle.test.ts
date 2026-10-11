import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycleMocks = vi.hoisted(() => ({
  marketplaceRegistry: [] as Array<{ id: string; status: "enabled"; provider: Record<string, unknown> }>,
  openBrowser: vi.fn(),
  captureAuctions: vi.fn(),
  captureTavily: vi.fn(),
  env: { fixtureMode: false, enableTavily: false, tavilyApiKey: undefined as string | undefined, researchTimeBudgetSeconds: 240 },
}));

vi.mock("../src/server/providers/marketplaces/registry", () => ({ marketplaceRegistry: lifecycleMocks.marketplaceRegistry }));
vi.mock("../src/server/browser/browser-provider", () => ({ browserProvider: { open: lifecycleMocks.openBrowser } }));
vi.mock("../src/server/config/env", () => ({ env: lifecycleMocks.env }));
vi.mock("../src/server/providers/auctions/capture-auctions", () => ({
  captureAuctionSearches: lifecycleMocks.captureAuctions,
  skippedAuctionSources: () => [
    { source: "Yahoo Auctions", status: "skipped", candidatesSeen: 0, comparableSignals: 0, signals: [] },
    { source: "Mandarake Auction", status: "skipped", candidatesSeen: 0, comparableSignals: 0, signals: [] },
  ],
}));
vi.mock("../src/price/tavily-price-fallback", () => ({
  disabledTavilyFallback: () => ({ version: 1, provider: "Tavily", triggered: false, query: "", searchUrl: "", capturedAt: "", searchError: null, results: [], candidates: [], usage: null }),
  captureTavilyPriceFallback: lifecycleMocks.captureTavily,
}));

import { fixtureResult } from "../src/server/analysis/fixture-result";
import type { MarketplaceSource, SearchSnapshot } from "../src/price/types";

function sourceResult(source: MarketplaceSource): SearchSnapshot["sources"][number] {
  return { source, keyword: "fixture keyword", searchUrl: "https://example.test/search", error: null, candidates: [] };
}

function register(provider: Record<string, unknown>): void {
  lifecycleMocks.marketplaceRegistry.push({ id: String(provider.source), status: "enabled", provider });
}

function httpProvider(source: MarketplaceSource) {
  const search = vi.fn(async () => sourceResult(source));
  return { source, runtime: "http", supportsProfile: () => true, search };
}

function browserMarketplace(source: MarketplaceSource, searchWithBrowser = vi.fn(async () => sourceResult(source))) {
  return { source, runtime: "browser", supportsProfile: () => true, searchWithBrowser };
}

function createLease() {
  const closeListeners: Array<() => void> = [];
  let closed = false;
  const context = {
    async newPage() {
      return { async goto() {}, async evaluate() { return []; }, async waitForSelector() {}, async close() {} };
    },
    onClose(listener: () => void) { closeListeners.push(listener); },
  };
  const close = vi.fn(async () => {
    if (closed) return;
    closed = true;
    closeListeners.forEach((listener) => listener());
  });
  lifecycleMocks.openBrowser.mockResolvedValue({ context, close });
  return { context, close };
}

async function runResearch(options: { collectorMode?: boolean; signal?: AbortSignal } = {}) {
  const fixture = fixtureResult({ collectorMode: options.collectorMode ?? false });
  const { researchCollectible } = await import("../src/server/analysis/run-pipeline");
  return researchCollectible({
    identification: fixture.identification,
    collectorMode: options.collectorMode ?? false,
    collectorEvidence: options.collectorMode ? fixture.collectorEvidence : null,
    signal: options.signal,
  });
}

beforeEach(() => {
  lifecycleMocks.marketplaceRegistry.length = 0;
  lifecycleMocks.env.fixtureMode = false;
  lifecycleMocks.env.enableTavily = false;
  lifecycleMocks.openBrowser.mockReset();
  lifecycleMocks.captureAuctions.mockReset().mockResolvedValue([
    { source: "Yahoo Auctions", status: "succeeded", candidatesSeen: 0, comparableSignals: 0, signals: [] },
    { source: "Mandarake Auction", status: "succeeded", candidatesSeen: 0, comparableSignals: 0, signals: [] },
  ]);
  lifecycleMocks.captureTavily.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

describe("research Browser lease lifecycle", () => {
  it("does not open a Browser lease for API-only Marketplace providers", async () => {
    const provider = httpProvider("Rakuten");
    register(provider);

    const workflow = await runResearch();

    expect(provider.search).toHaveBeenCalledOnce();
    expect(lifecycleMocks.openBrowser).not.toHaveBeenCalled();
    expect(workflow.toolActivity.find((activity) => activity.provider === "Rakuten")?.status).toBe("succeeded");
    expect(workflow.toolActivity.find((activity) => activity.provider === "Mercari")?.status).toBe("skipped");
    expect(workflow.result.cost.marketplacePages).toBe(0);
  });

  it("opens one shared lease for mixed API and Browser providers", async () => {
    const apiProvider = httpProvider("Rakuten");
    const lease = createLease();
    let receivedContext: unknown;
    const browserProvider = browserMarketplace("Mercari", vi.fn(async ({ context }: { context: unknown }) => {
      receivedContext = context;
      return sourceResult("Mercari");
    }));
    register(apiProvider);
    register(browserProvider);

    const workflow = await runResearch();

    expect(lifecycleMocks.openBrowser).toHaveBeenCalledOnce();
    expect(receivedContext).toBe(lease.context);
    expect(lease.close).toHaveBeenCalledOnce();
    expect(workflow.result.cost.marketplacePages).toBe(1);
  });

  it("isolates a failed Browser provider while retaining the API provider result", async () => {
    const apiProvider = httpProvider("Rakuten");
    register(apiProvider);
    register(browserMarketplace("Mercari"));
    lifecycleMocks.openBrowser.mockRejectedValue(new Error("Browserless unavailable"));

    const workflow = await runResearch();

    expect(apiProvider.search).toHaveBeenCalledOnce();
    expect(workflow.toolActivity.find((activity) => activity.provider === "Rakuten")?.status).toBe("succeeded");
    expect(workflow.toolActivity.find((activity) => activity.provider === "Mercari")?.status).toBe("failed");
  });

  it("closes the shared lease when a Browser provider search fails", async () => {
    const lease = createLease();
    const apiProvider = httpProvider("Rakuten");
    const failingBrowserProvider = browserMarketplace("Mercari", vi.fn(async () => { throw new Error("Mercari page failed"); }));
    register(apiProvider);
    register(failingBrowserProvider);

    const workflow = await runResearch();

    expect(apiProvider.search).toHaveBeenCalledOnce();
    expect(workflow.toolActivity.find((activity) => activity.provider === "Rakuten")?.status).toBe("succeeded");
    expect(workflow.toolActivity.find((activity) => activity.provider === "Mercari")?.status).toBe("failed");
    expect(lease.close).toHaveBeenCalledOnce();
  });

  it("shares the Marketplace lease with Collector Auctions", async () => {
    const lease = createLease();
    register(browserMarketplace("Rakuten"));
    register(browserMarketplace("Mercari"));

    await runResearch({ collectorMode: true });

    expect(lifecycleMocks.openBrowser).toHaveBeenCalledOnce();
    expect(lifecycleMocks.captureAuctions).toHaveBeenCalledOnce();
    expect(lifecycleMocks.captureAuctions.mock.calls[0]?.[0].context).toBe(lease.context);
    expect(lease.close).toHaveBeenCalledOnce();
  });

  it("lets Tavily request the shared lease only when it needs result pages", async () => {
    const lease = createLease();
    register(httpProvider("Rakuten"));
    register(httpProvider("Mercari"));
    lifecycleMocks.env.enableTavily = true;
    lifecycleMocks.captureTavily.mockImplementation(async ({ getBrowserContext }: { getBrowserContext: () => Promise<unknown> }) => {
      expect(await getBrowserContext()).toBe(lease.context);
      return { version: 1, provider: "Tavily", triggered: true, query: "q", searchUrl: "https://api.tavily.com/search", capturedAt: "", searchError: null, results: [], candidates: [], usage: null };
    });

    await runResearch();

    expect(lifecycleMocks.captureTavily).toHaveBeenCalledOnce();
    expect(lifecycleMocks.openBrowser).toHaveBeenCalledOnce();
    expect(lease.close).toHaveBeenCalledOnce();
  });

  it("closes the active Browser lease when the workflow is canceled", async () => {
    const lease = createLease();
    let searchStarted!: () => void;
    const started = new Promise<void>((resolve) => { searchStarted = resolve; });
    const pendingBrowserSearch = browserMarketplace("Rakuten", vi.fn(({ context }: { context: typeof lease.context }) => new Promise((_resolve, reject) => {
      context.onClose(() => reject(new Error("Browser context closed")));
      searchStarted();
    })));
    register(pendingBrowserSearch);
    const controller = new AbortController();
    const workflowPromise = runResearch({ signal: controller.signal });
    await started;

    controller.abort(new Error("Client canceled the research stream."));

    await expect(workflowPromise).rejects.toThrow("Client canceled the research stream.");
    expect(lease.close).toHaveBeenCalledOnce();
  });
});