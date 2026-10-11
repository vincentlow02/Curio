import type { Page } from "playwright-core";

import type { RakutenListingCandidate } from "../../../price/types";
import { captureBrowserSearch, type BrowserMarketplaceProvider } from "./shared/browser-search";
import { buildMarketplaceKeyword } from "./shared/keyword";

export function buildMercariKeyword(keyword: string): string {
  return buildMarketplaceKeyword(keyword).replace(/中古/g, " ").replace(/\s+/g, " ").trim();
}

function buildMercariSearchUrl(keyword: string): string {
  return `https://jp.mercari.com/search?keyword=${encodeURIComponent(buildMercariKeyword(keyword))}&status=on_sale`;
}

async function captureMercari(page: Page, maxCards: number): Promise<RakutenListingCandidate[]> {
  try {
    await page.waitForSelector("a[href*='/item/']", { timeout: 10_000 });
  } catch {
    return [];
  }
  return page.evaluate((limit): RakutenListingCandidate[] => {
    const results: RakutenListingCandidate[] = [];
    const urls = new Set<string>();
    for (const anchor of [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/item/']")]) {
      const href = anchor.href;
      if (!/^https:\/\/jp\.mercari\.com\/item\//i.test(href) || urls.has(href)) continue;
      let node: HTMLElement | null = anchor;
      let cardText = (anchor.textContent || "").replace(/\s+/g, " ").trim();
      for (let depth = 0; depth < 6 && node?.parentElement; depth += 1) {
        node = node.parentElement;
        const text = (node.innerText || "").replace(/\s+/g, " ").trim();
        if (/(?:¥\s*[\d,]+|[\d,]+\s*円)/.test(text) && text.length <= 1500) { cardText = text; break; }
      }
      const priceMatch = cardText.match(/(?:¥\s*|^)([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,})(?:\s*円)?/);
      const title = cardText.replace(/^現在\s*/i, "").replace(/^¥\s*[\d,]+\s*/, "").replace(/^[\d,]+\s*円\s*/, "").trim();
      if (title.length < 4) continue;
      urls.add(href);
      results.push({
        source: "Mercari",
        rank: results.length + 1,
        title,
        displayedPrice: priceMatch ? Number(priceMatch[1]!.replace(/,/g, "")) : null,
        url: href,
        shopName: "individual_seller",
        availabilityText: "",
      });
      if (results.length >= limit) break;
    }
    return results;
  }, maxCards);
}

export const mercariProvider: BrowserMarketplaceProvider = {
  source: "Mercari",
  runtime: "browser",
  supportsProfile: () => true,
  searchWithBrowser(args) {
    const normalizedKeyword = buildMercariKeyword(args.keyword);
    return captureBrowserSearch({
      context: args.context,
      source: "Mercari",
      keyword: normalizedKeyword,
      searchUrl: buildMercariSearchUrl(args.keyword),
      maxCards: args.maxCards,
      ...(args.onPageOpened ? { onPageOpened: args.onPageOpened } : {}),
      capture: captureMercari,
    });
  },
};