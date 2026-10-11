import type { BrowserContext, Page } from "playwright-core";

import type { MarketplaceSource, MarketplaceCandidate, SearchSnapshot } from "../../../../price/types";
import { observeBrowserPageRequests } from "../../../analysis/marketplace-cost-tracker";
import type { MarketplaceProviderBase, MarketplaceSearchInput } from "../types";

export type BrowserMarketplaceProvider = MarketplaceProviderBase & {
  runtime: "browser";
  searchWithBrowser(args: MarketplaceSearchInput & { context: BrowserContext; onPageOpened?: () => void }): Promise<SearchSnapshot["sources"][number]>;
};

export type BrowserCaptureResult = {
  candidates: MarketplaceCandidate[];
  diagnostics?: Array<Record<string, unknown>>;
  rejectionReasons?: Array<Record<string, unknown>>;
};

export async function captureBrowserSearch(args: {
  context: BrowserContext;
  source: MarketplaceSource;
  keyword: string;
  searchUrl: string;
  maxCards: number;
  onPageOpened?: () => void;
  onRequest?: () => void;
  onHttpRequestStarted?: () => void;
  onHttpRequestCompleted?: (status: number | null, elapsedMs: number, blockingRelevant?: boolean) => void;
  beforeNavigation?: (page: Page) => void | Promise<void>;
  capture(page: Page, maxCards: number): Promise<MarketplaceCandidate[] | BrowserCaptureResult>;
}): Promise<SearchSnapshot["sources"][number]> {
  let page: Page | null = null;
  try {
    page = await args.context.newPage();
    args.onPageOpened?.();
    observeBrowserPageRequests(page, {
      ...(args.onHttpRequestStarted ? { onHttpRequestStarted: args.onHttpRequestStarted } : {}),
      ...(args.onHttpRequestCompleted ? { onHttpRequestCompleted: args.onHttpRequestCompleted } : {}),
    });
    args.onRequest?.();
    await args.beforeNavigation?.(page);
    await page.goto(args.searchUrl, { waitUntil: "domcontentloaded", timeout: 40_000 });
    const result = await args.capture(page, args.maxCards);
    const normalised = Array.isArray(result) ? { candidates: result } : result;
    return {
      source: args.source,
      keyword: args.keyword,
      searchUrl: args.searchUrl,
      error: null,
      candidates: normalised.candidates,
      ...(normalised.diagnostics ? { diagnostics: normalised.diagnostics } : {}),
      ...(normalised.rejectionReasons ? { rejectionReasons: normalised.rejectionReasons } : {}),
    };
  } catch (error) {
    return {
      source: args.source,
      keyword: args.keyword,
      searchUrl: args.searchUrl,
      error: error instanceof Error ? error.message : String(error),
      candidates: [],
      diagnostics: [{ stage: "capture_exception", message: error instanceof Error ? error.message : String(error) }],
      rejectionReasons: [{ reason: "capture_exception", message: error instanceof Error ? error.message : String(error) }],
    };
  } finally {
    await page?.close().catch(() => undefined);
  }
}
