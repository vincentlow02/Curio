import type { BrowserContext } from "playwright-core";

import type { ItemProfile } from "../../../price/item-profile";
import type { SearchSnapshot } from "../../../price/types";
import { selectMarketplaceProviders } from "./selector";

export async function coordinateMarketplaceSearches(args: {
  profile: ItemProfile;
  keyword: string;
  maxCardsPerSource: number;
  signal?: AbortSignal;
  getBrowserContext?: () => Promise<BrowserContext>;
}): Promise<SearchSnapshot> {
  const providers = selectMarketplaceProviders(args.profile);
  const input = {
    keyword: args.keyword,
    maxCards: args.maxCardsPerSource,
    ...(args.signal ? { signal: args.signal } : {}),
  };
  const browserProviders = providers.filter((provider) => provider.runtime === "browser");
  const browserContextResult = browserProviders.length && args.getBrowserContext
    ? args.getBrowserContext().then((context) => ({ context }), (error: unknown) => ({ error }))
    : null;
  const settled = await Promise.allSettled(providers.map((provider) => {
    return provider.runtime === "browser"
      ? browserContextResult
        ? browserContextResult.then((result) => {
            if ("error" in result) throw result.error;
            return provider.searchWithBrowser({ ...input, context: result.context });
          })
        : Promise.reject(new Error("A browser context is required by this Marketplace provider."))
      : provider.search(input);
  }));
  const sources: SearchSnapshot["sources"] = settled.map((entry, index) => {
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
  return { version: 2, capturedAt: new Date().toISOString(), sources };
}