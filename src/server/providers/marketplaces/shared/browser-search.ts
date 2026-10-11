import type { BrowserContext, Page } from "playwright-core";

import type { MarketplaceSource, RakutenListingCandidate, SearchSnapshot } from "../../../../price/types";
import type { MarketplaceProviderBase, MarketplaceSearchInput } from "../types";

export type BrowserMarketplaceProvider = MarketplaceProviderBase & {
  runtime: "browser";
  searchWithBrowser(args: MarketplaceSearchInput & { context: BrowserContext; onPageOpened?: () => void }): Promise<SearchSnapshot["sources"][number]>;
};

export async function captureBrowserSearch(args: {
  context: BrowserContext;
  source: MarketplaceSource;
  keyword: string;
  searchUrl: string;
  maxCards: number;
  onPageOpened?: () => void;
  capture(page: Page, maxCards: number): Promise<RakutenListingCandidate[]>;
}): Promise<SearchSnapshot["sources"][number]> {
  let page: Page | null = null;
  try {
    page = await args.context.newPage();
    args.onPageOpened?.();
    await page.goto(args.searchUrl, { waitUntil: "domcontentloaded", timeout: 40_000 });
    const candidates = await args.capture(page, args.maxCards);
    return { source: args.source, keyword: args.keyword, searchUrl: args.searchUrl, error: null, candidates };
  } catch (error) {
    return { source: args.source, keyword: args.keyword, searchUrl: args.searchUrl, error: error instanceof Error ? error.message : String(error), candidates: [] };
  } finally {
    await page?.close().catch(() => undefined);
  }
}
