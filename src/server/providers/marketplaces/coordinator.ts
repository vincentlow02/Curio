import type { BrowserContext } from "playwright-core";

import { MARKETPLACE_IDS } from "../../../core/marketplace";
import type { ItemProfile } from "../../../price/item-profile";
import type { MarketplaceSource, SearchSnapshot } from "../../../price/types";
import type { ResearchCostTracker } from "../../analysis/marketplace-cost-tracker";
import { selectMarketplaceProviders } from "./selector";

const DEFAULT_MAX_CONCURRENT_PROVIDERS = 4;

type ProviderSearchSettlement =
  | { status: "fulfilled"; value: SearchSnapshot["sources"][number]; durationMs: number }
  | { status: "rejected"; reason: unknown; durationMs: number };

function yahooStoreItemKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "store.shopping.yahoo.co.jp" || !/^\/suruga-ya\/[a-z0-9_-]+\.html$/i.test(url.pathname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deduplicateYahooStoreListings(sources: SearchSnapshot["sources"]): SearchSnapshot["sources"] {
  const apiListingKeys = new Set(sources
    .filter((source) => source.source === MARKETPLACE_IDS.yahooShopping)
    .flatMap((source) => source.candidates
      .filter((candidate) => candidate.listingCondition === "used"
        && candidate.displayedPrice !== null
        && candidate.displayedPrice > 0
        && candidate.availabilityText !== "在庫なし"
        && candidate.availabilityText !== "unknown")
      .map((candidate) => yahooStoreItemKey(candidate.url))
      .filter((key): key is string => key !== null)));
  if (!apiListingKeys.size) return sources;

  return sources.map((source) => {
    if (source.source !== MARKETPLACE_IDS.surugayaYahooStore) return source;
    const isDuplicate = (url: unknown): boolean => typeof url === "string" && Boolean(yahooStoreItemKey(url) && apiListingKeys.has(yahooStoreItemKey(url)!));
    const diagnostics = source.diagnostics?.map((diagnostic) => {
      if (!Array.isArray(diagnostic.listings)) return diagnostic;
      return { ...diagnostic, listings: diagnostic.listings.filter((listing) => !isRecord(listing) || !isDuplicate(listing.url)) };
    });
    return {
      ...source,
      candidates: source.candidates.filter((candidate) => !isDuplicate(candidate.url)).map((candidate, index) => ({ ...candidate, rank: index + 1 })),
      ...(diagnostics ? { diagnostics } : {}),
    };
  });
}

export type CoordinatedMarketplaceSearch = {
  snapshot: SearchSnapshot;
  durationMsBySource: Partial<Record<MarketplaceSource, number>>;
  callsBySource: Partial<Record<MarketplaceSource, number>>;
};

export async function coordinateMarketplaceSearches(args: {
  profile: ItemProfile;
  keyword: string;
  maxCardsPerSource: number;
  signal?: AbortSignal;
  maxConcurrentProviders?: number;
  getBrowserContext?: () => Promise<BrowserContext>;
  onBrowserPageOpened?: (source: MarketplaceSource) => void;
  costTracker?: ResearchCostTracker;
}): Promise<CoordinatedMarketplaceSearch> {
  const providers = selectMarketplaceProviders(args.profile);
  const input = {
    profile: args.profile,
    keyword: args.keyword,
    maxCards: args.maxCardsPerSource,
    ...(args.signal ? { signal: args.signal } : {}),
  };
  const browserProviders = providers.filter((provider) => provider.runtime === "browser");
  const browserContextResult = browserProviders.length && args.getBrowserContext
    ? Promise.resolve().then(() => args.getBrowserContext!()).then((context) => ({ context }), (error: unknown) => ({ error }))
    : null;
  const callsBySource: Partial<Record<MarketplaceSource, number>> = {};
  const settled: ProviderSearchSettlement[] = new Array(providers.length);
  let nextProviderIndex = 0;
  const runProvider = async (index: number): Promise<void> => {
    const provider = providers[index]!;
    const startedAt = performance.now();
    const meter = args.costTracker?.beginProviderSearch(provider.source, provider.runtime);
    const providerInput = {
      ...input,
      onRequest: () => {
        callsBySource[provider.source] = (callsBySource[provider.source] ?? 0) + 1;
      },
      ...(meter ? {
        onHttpRequestStarted: () => meter.requestStarted(provider.runtime === "http"),
        onHttpRequestCompleted: (status: number | null, elapsedMs: number, blockingRelevant?: boolean) => meter.requestCompleted(status, elapsedMs, blockingRelevant),
      } : {}),
    };
    try {
      const value = await Promise.resolve().then(() => provider.runtime === "browser"
      ? browserContextResult
        ? browserContextResult.then((result) => {
            if ("error" in result) throw result.error;
            return provider.searchWithBrowser({
              ...providerInput,
              context: result.context,
              onPageOpened: () => {
                meter?.pageOpened();
                args.onBrowserPageOpened?.(provider.source);
              },
            });
          })
        : Promise.reject(new Error("A browser context is required by this Marketplace provider."))
      : provider.search(providerInput));
      meter?.finish({ candidates: value.candidates, error: value.error });
      settled[index] = { status: "fulfilled", value, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) };
    } catch (reason) {
      meter?.finish({ error: reason instanceof Error ? reason.message : String(reason) });
      settled[index] = { status: "rejected", reason, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) };
    }
  };
  const concurrency = Math.min(
    providers.length,
    Math.max(1, Math.floor(args.maxConcurrentProviders ?? DEFAULT_MAX_CONCURRENT_PROVIDERS)),
  );
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (nextProviderIndex < providers.length) {
      const index = nextProviderIndex;
      nextProviderIndex += 1;
      await runProvider(index);
    }
  }));
  const durationMsBySource: Partial<Record<MarketplaceSource, number>> = {};
  const settledSources: SearchSnapshot["sources"] = settled.map((entry, index) => {
    durationMsBySource[providers[index]!.source] = entry.durationMs;
    if (entry.status === "fulfilled") return entry.value;
    const provider = providers[index]!;
    return {
      source: provider.source,
      keyword: args.keyword,
      searchUrl: "",
      error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
      candidates: [],
    };
  });
  const sources = deduplicateYahooStoreListings(settledSources);
  return { snapshot: { version: 2, capturedAt: new Date().toISOString(), sources }, durationMsBySource, callsBySource };
}