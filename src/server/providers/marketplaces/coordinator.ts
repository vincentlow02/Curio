import type { BrowserContext } from "playwright-core";

import { MARKETPLACE_IDS } from "../../../core/marketplace";
import type { ItemProfile } from "../../../price/item-profile";
import type { MarketplaceSource, SearchSnapshot } from "../../../price/types";
import type { ResearchCostTracker } from "../../analysis/marketplace-cost-tracker";
import { selectMarketplaceProviders } from "./selector";

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
  const settled = await Promise.all(providers.map((provider) => {
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
    const search = Promise.resolve().then(() => provider.runtime === "browser"
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
    const durationMs = (): number => Math.max(0, Math.round(performance.now() - startedAt));
    return search.then(
      (value) => {
        meter?.finish({ candidates: value.candidates, error: value.error });
        return { status: "fulfilled" as const, value, durationMs: durationMs() };
      },
      (reason: unknown) => {
        meter?.finish({ error: reason instanceof Error ? reason.message : String(reason) });
        return { status: "rejected" as const, reason, durationMs: durationMs() };
      },
    );
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