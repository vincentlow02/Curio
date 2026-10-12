import "server-only";

import { load } from "cheerio";

import { MARKETPLACE_IDS } from "../../../core/marketplace";
import type { MarketplaceCandidate, SearchSnapshot } from "../../../price/types";
import { env } from "../../config/env";
import { buildMarketplaceKeyword } from "./shared/keyword";
import { createTimeoutSignal, fetchWithHttpMetrics } from "./shared/http";
import type { HttpMarketplaceProvider, MarketplaceSearchInput } from "./types";

const SEARCH_ORIGIN = "https://store.shopping.yahoo.co.jp";
const STORE_PATH = "/suruga-ya";
const REQUEST_TIMEOUT_MS = 12_000;
const PRODUCT_PATH = /^\/suruga-ya\/[a-z0-9_-]+\.html$/i;

export type SurugayaYahooAvailability = "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

export type SurugayaYahooListing = {
  title: string;
  price: number;
  url: string;
  availability: SurugayaYahooAvailability;
};

export type SurugayaYahooSearchResult = {
  candidates: MarketplaceCandidate[];
  listings: SurugayaYahooListing[];
  itemBoxCount: number;
  rejectedCount: number;
  error: string | null;
};

function normalizeQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("ja-JP");
}

function productPath(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, SEARCH_ORIGIN);
    if (parsed.protocol !== "https:" || parsed.hostname !== "store.shopping.yahoo.co.jp" || !PRODUCT_PATH.test(parsed.pathname)) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasStockFields(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasStockFields);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => /availability|stock|sold.?out/i.test(key) || hasStockFields(child));
}

function availabilityFromProductRecord(value: Record<string, unknown>): SurugayaYahooAvailability {
  const evidence = new Set<SurugayaYahooAvailability>();
  const visit = (current: unknown, key = "", inStockContext = false): void => {
    const normalizedKey = key.toLocaleLowerCase("en-US");
    const relevantContext = inStockContext || /availability|stock|sold.?out/.test(normalizedKey);
    if (typeof current === "boolean") {
      if (/^(?:in_?stock|is_?in_?stock)$/.test(normalizedKey) && current) evidence.add("IN_STOCK");
      if (/^(?:in_?stock|is_?in_?stock)$/.test(normalizedKey) && !current) evidence.add("OUT_OF_STOCK");
      if (/^(?:sold_?out|is_?sold_?out|out_?of_?stock|is_?out_?of_?stock)$/.test(normalizedKey) && current) evidence.add("OUT_OF_STOCK");
      return;
    }
    if (typeof current === "string" && relevantContext) {
      const text = current.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
      if (/在庫あり|在庫有り|instock|in stock|schema\.org\/instock/.test(text)) evidence.add("IN_STOCK");
      if (/在庫なし|在庫無し|品切れ|売り切れ|売切れ|sold.?out|out of stock|schema\.org\/outofstock/.test(text)) evidence.add("OUT_OF_STOCK");
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((child) => visit(child, key, relevantContext));
      return;
    }
    if (isRecord(current)) {
      for (const [childKey, child] of Object.entries(current)) visit(child, childKey, relevantContext);
    }
  };
  visit(value);
  if (evidence.size !== 1) return "UNKNOWN";
  return evidence.values().next().value ?? "UNKNOWN";
}

function embeddedAvailability(html: string): Map<string, SurugayaYahooAvailability> {
  const $ = load(html);
  const statusesByPath = new Map<string, Set<SurugayaYahooAvailability>>();
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const path = productPath(typeof record.url === "string" ? record.url : undefined);
    if (path && hasStockFields(record)) {
      const statuses = statusesByPath.get(path) ?? new Set<SurugayaYahooAvailability>();
      statuses.add(availabilityFromProductRecord(record));
      statusesByPath.set(path, statuses);
    }
    Object.values(record).forEach(visit);
  };

  $("script[type='application/ld+json'], script[type='application/json'], script#__NEXT_DATA__").each((_, element) => {
    const text = $(element).html()?.trim();
    if (!text) return;
    try {
      visit(JSON.parse(text) as unknown);
    } catch {
      return;
    }
  });

  return new Map([...statusesByPath].map(([path, statuses]) => [
    path,
    statuses.size === 1 && !statuses.has("UNKNOWN") ? statuses.values().next().value! : "UNKNOWN",
  ]));
}

function positivePrice(value: string): number | null {
  const normalized = value.replace(/[\s¥￥]/g, "").trim();
  const match = /^([1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)(?:円)?$/.exec(normalized);
  if (!match) return null;
  const price = Number(match[1]!.replace(/,/g, ""));
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

export function parseSurugayaYahooStoreSearchPage(html: string, keyword: string, maxCards = 30): SurugayaYahooSearchResult {
  const limit = Math.min(Math.max(Math.floor(maxCards), 0), 30);
  const empty: SurugayaYahooSearchResult = { candidates: [], listings: [], itemBoxCount: 0, rejectedCount: 0, error: null };
  const normalizedKeyword = normalizeQuery(keyword);
  if (!normalizedKeyword || limit === 0) return empty;

  const $ = load(html);
  const canonical = $("link[rel='canonical']").attr("href");
  try {
    const pageUrl = new URL(canonical ?? "");
    if (pageUrl.origin !== SEARCH_ORIGIN || pageUrl.pathname !== `${STORE_PATH}/search.html`
      || normalizeQuery(pageUrl.searchParams.get("p") ?? "") !== normalizedKeyword) {
      return { ...empty, error: "invalid_response: Surugaya Yahoo Store canonical URL does not match the search keyword." };
    }
  } catch {
    return { ...empty, error: "invalid_response: Surugaya Yahoo Store search page has no valid canonical URL." };
  }

  const stockByPath = embeddedAvailability(html);
  const cards = $(".js-target-main-content div[class^='SearchResult_SearchResultItem__']").filter((_, element) => {
    const firstClass = ($(element).attr("class") ?? "").split(/\s+/)[0] ?? "";
    return /^SearchResult_SearchResultItem__[a-z0-9]+$/i.test(firstClass);
  });
  const listings: SurugayaYahooListing[] = [];
  const candidates: MarketplaceCandidate[] = [];
  const seenPaths = new Set<string>();
  let rejectedCount = 0;

  cards.each((_, element) => {
    if (listings.length >= limit) return;
    const card = $(element);
    let path: string | null = null;
    card.find("a[href]").each((__, anchor) => {
      if (path) return;
      path = productPath($(anchor).attr("href"));
    });
    const itemPath = path;
    const title = card.find("[class*='ItemTitle_SearchResultItemTitle__']").first().text().replace(/\s+/g, " ").trim();
    const priceElement = card.find("[class*='ItemPrice_ItemPrice__']").toArray()
      .find((priceNode) => !($(priceNode).attr("class") ?? "").includes("__unit"));
    const price = priceElement ? positivePrice($(priceElement).text()) : null;
    if (!itemPath || !title || price === null || seenPaths.has(itemPath)) {
      rejectedCount += 1;
      return;
    }

    seenPaths.add(itemPath);
    const availability = stockByPath.get(itemPath) ?? "UNKNOWN";
    const listing = { title, price, url: `${SEARCH_ORIGIN}${itemPath}`, availability };
    listings.push(listing);
    candidates.push({
      source: MARKETPLACE_IDS.surugayaYahooStore,
      rank: candidates.length + 1,
      title,
      displayedPrice: availability === "UNKNOWN" ? null : price,
      url: listing.url,
      shopName: "駿河屋Yahoo!店",
      availabilityText: availability === "OUT_OF_STOCK" ? "在庫なし" : availability === "UNKNOWN" ? "unknown" : "",
    });
  });

  return { candidates, listings, itemBoxCount: cards.length, rejectedCount, error: null };
}

function searchUrl(keyword: string): string {
  const url = new URL(`${STORE_PATH}/search.html`, SEARCH_ORIGIN);
  url.searchParams.set("p", keyword);
  return url.href;
}

function emptySource(keyword: string, url: string, error: string): SearchSnapshot["sources"][number] {
  return { source: MARKETPLACE_IDS.surugayaYahooStore, keyword, searchUrl: url, error, candidates: [] };
}

async function searchSurugayaYahooStore(args: MarketplaceSearchInput): Promise<SearchSnapshot["sources"][number]> {
  const keyword = buildMarketplaceKeyword(args.profile.priceSearchKeywordJa || args.keyword);
  const url = searchUrl(keyword);
  if (!keyword) return emptySource(keyword, url, "invalid_query: Surugaya Yahoo Store search keyword is empty.");
  if (!env.surugayaYahooStoreDataLicenseVerified) {
    return emptySource(keyword, url, "configuration_error: Surugaya Yahoo Store data-use authorization is not verified.");
  }

  const signal = createTimeoutSignal(args.signal, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchWithHttpMetrics(fetch, url, {
      method: "GET",
      headers: { Accept: "text/html", "User-Agent": "Curio/1.0" },
      redirect: "manual",
      signal,
    }, {
      ...(args.onRequest ? { onRequest: args.onRequest } : {}),
      ...(args.onHttpRequestStarted ? { onHttpRequestStarted: args.onHttpRequestStarted } : {}),
      ...(args.onHttpRequestCompleted ? { onHttpRequestCompleted: args.onHttpRequestCompleted } : {}),
    });
    if (!response.ok) return emptySource(keyword, url, `upstream_error: Surugaya Yahoo Store returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html/i.test(contentType)) return emptySource(keyword, url, "invalid_response: Surugaya Yahoo Store search response was not HTML.");

    const parsed = parseSurugayaYahooStoreSearchPage(await response.text(), keyword, args.maxCards);
    return {
      source: MARKETPLACE_IDS.surugayaYahooStore,
      keyword,
      searchUrl: url,
      error: parsed.error,
      candidates: parsed.candidates,
      diagnostics: [{ kind: "listing_discovery", itemBoxCount: parsed.itemBoxCount, rejectedCount: parsed.rejectedCount, listings: parsed.listings }],
    };
  } catch {
    if (args.signal?.aborted) throw args.signal.reason instanceof Error ? args.signal.reason : new Error("Surugaya Yahoo Store search canceled.");
    return emptySource(keyword, url, signal.aborted ? "timeout: Surugaya Yahoo Store request timed out." : "network_error: Surugaya Yahoo Store request failed.");
  }
}

export const surugayaYahooStoreProvider: HttpMarketplaceProvider = {
  source: MARKETPLACE_IDS.surugayaYahooStore,
  runtime: "http",
  supportsProfile: () => env.surugayaYahooStoreDataLicenseVerified,
  search: searchSurugayaYahooStore,
};