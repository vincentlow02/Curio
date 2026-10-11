import type { Page } from "playwright-core";

import { MARKETPLACE_IDS } from "../../../core/marketplace";
import type { MarketplaceCandidate } from "../../../price/types";
import { captureBrowserSearch, type BrowserMarketplaceProvider } from "./shared/browser-search";
import { buildMarketplaceKeyword } from "./shared/keyword";

function buildRakutenSearchUrl(keyword: string): string {
  return `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(buildMarketplaceKeyword(keyword))}/`;
}

async function captureRakuten(page: Page, maxCards: number): Promise<MarketplaceCandidate[]> {
  const sourceId = MARKETPLACE_IDS.rakuten;
  return page.evaluate(({ limit, sourceId }): MarketplaceCandidate[] => {
    const results: MarketplaceCandidate[] = [];
    const urls = new Set<string>();
    for (const anchor of [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]) {
      const href = anchor.href;
      if (!/item\.rakuten\.co\.jp|ias\.rakuten\.co\.jp\/redirect|redirect_rpp/i.test(href) || urls.has(href)) continue;
      const title = (anchor.getAttribute("aria-label") || anchor.getAttribute("title") || anchor.textContent || "").replace(/\s+/g, " ").trim();
      if (title.length < 8) continue;
      let node: HTMLElement | null = anchor;
      let cardText = title;
      for (let depth = 0; depth < 8 && node?.parentElement; depth += 1) {
        node = node.parentElement;
        const text = (node.innerText || "").replace(/\s+/g, " ").trim();
        if (/\d[\d,]*\s*円/.test(text) && text.length <= 3000) { cardText = text; break; }
      }
      const priceMatch = cardText.match(/(?:税込\s*)?([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,})\s*円/);
      const shopMatch = cardText.match(/(?:ショップ|販売店|店舗)[:：]?\s*([^|｜]{2,40})/);
      urls.add(href);
      results.push({
        source: sourceId,
        rank: results.length + 1,
        title,
        displayedPrice: priceMatch ? Number(priceMatch[1]!.replace(/,/g, "")) : null,
        url: href,
        shopName: shopMatch?.[1]?.trim() ?? "unknown",
        availabilityText: /売り切れ|売切れ|在庫なし/.test(cardText) ? "sold_out" : "",
      });
      if (results.length >= limit) break;
    }
    return results;
  }, { limit: maxCards, sourceId });
}

export const rakutenBrowserProvider: BrowserMarketplaceProvider = {
  source: "Rakuten",
  runtime: "browser",
  supportsProfile: () => true,
  searchWithBrowser(args) {
    return captureBrowserSearch({
      context: args.context,
      source: MARKETPLACE_IDS.rakuten,
      keyword: buildMarketplaceKeyword(args.keyword),
      searchUrl: buildRakutenSearchUrl(args.keyword),
      maxCards: args.maxCards,
      ...(args.onPageOpened ? { onPageOpened: args.onPageOpened } : {}),
      ...(args.onRequest ? { onRequest: args.onRequest } : {}),
      ...(args.onHttpRequestStarted ? { onHttpRequestStarted: args.onHttpRequestStarted } : {}),
      ...(args.onHttpRequestCompleted ? { onHttpRequestCompleted: args.onHttpRequestCompleted } : {}),
      capture: captureRakuten,
    });
  },
};