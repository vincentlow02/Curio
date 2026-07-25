import { chromium, type Page } from "playwright";

import type { MarketplaceSource, RakutenListingCandidate, SearchSnapshot } from "./types";

export function buildMarketplaceKeyword(keyword: string): string {
  return keyword
    .replace(/["“”「」『』]/g, " ")
    .replace(/五重奏団?/g, " ")
    .replace(/\b(?:QUINTET|ORCHESTRA)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRakutenSearchUrl(keyword: string): string {
  return `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(buildMarketplaceKeyword(keyword))}/`;
}

export function buildMercariKeyword(keyword: string): string {
  return buildMarketplaceKeyword(keyword).replace(/中古/g, " ").replace(/\s+/g, " ").trim();
}

function buildMercariSearchUrl(keyword: string): string {
  return `https://jp.mercari.com/search?keyword=${encodeURIComponent(buildMercariKeyword(keyword))}&status=on_sale`;
}

async function captureRakuten(page: Page, maxCards: number): Promise<RakutenListingCandidate[]> {
  return page.evaluate((limit): RakutenListingCandidate[] => {
    const results: RakutenListingCandidate[] = [];
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
        source: "Rakuten",
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
  }, maxCards);
}

async function captureMercari(page: Page, maxCards: number): Promise<RakutenListingCandidate[]> {
  try {
    await page.waitForSelector("a[href*='/item/']", { timeout: 10_000 });
  } catch {
    // A valid Mercari zero-result page has no item anchors. Treat it as an
    // empty source rather than a provider failure; no retry is performed.
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

async function captureSource(args: {
  page: Page;
  source: MarketplaceSource;
  keyword: string;
  searchUrl: string;
  maxCards: number;
}): Promise<SearchSnapshot["sources"][number]> {
  try {
    await args.page.goto(args.searchUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const candidates = args.source === "Rakuten"
      ? await captureRakuten(args.page, args.maxCards)
      : await captureMercari(args.page, args.maxCards);
    return { source: args.source, keyword: args.keyword, searchUrl: args.searchUrl, error: null, candidates };
  } catch (error) {
    return { source: args.source, keyword: args.keyword, searchUrl: args.searchUrl, error: error instanceof Error ? error.message : String(error), candidates: [] };
  }
}

export async function captureMarketplaceSearches(args: { keyword: string; maxCardsPerSource: number; headless: boolean }): Promise<SearchSnapshot> {
  const rakutenKeyword = buildMarketplaceKeyword(args.keyword);
  const mercariKeyword = buildMercariKeyword(args.keyword);
  const browser = await chromium.launch({ headless: args.headless });
  try {
    const context = await browser.newContext({ locale: "ja-JP" });
    const rakutenPage = await context.newPage();
    const mercariPage = await context.newPage();
    const sources = await Promise.all([
      captureSource({ page: rakutenPage, source: "Rakuten", keyword: rakutenKeyword, searchUrl: buildRakutenSearchUrl(args.keyword), maxCards: args.maxCardsPerSource }),
      captureSource({ page: mercariPage, source: "Mercari", keyword: mercariKeyword, searchUrl: buildMercariSearchUrl(args.keyword), maxCards: args.maxCardsPerSource }),
    ]);
    return { version: 2, capturedAt: new Date().toISOString(), sources };
  } finally {
    await browser.close();
  }
}
