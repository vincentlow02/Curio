import "server-only";

import { load } from "cheerio";

import { MARKETPLACE_IDS } from "../../../core/marketplace";
import type { MarketplaceCandidate, SearchSnapshot } from "../../../price/types";
import { fetchWithHttpMetrics } from "../../analysis/marketplace-cost-tracker";
import { env } from "../../config/env";
import { buildMarketplaceKeyword } from "./shared/keyword";
import type { HttpMarketplaceProvider, MarketplaceSearchInput } from "./types";

const SEARCH_ORIGIN = "https://paypayfleamarket.yahoo.co.jp";
const REQUEST_TIMEOUT_MS = 10_000;

type ParsedYahooFurimaPage = {
  candidates: MarketplaceCandidate[];
  extraction: "next_data" | "html" | "none";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("ja-JP");
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const digits = value.replace(/[¥￥円,\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const price = Number(digits);
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

function parseItemId(value: unknown): string | null {
  const id = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return /^[A-Za-z0-9_-]{3,80}$/.test(id) ? id : null;
}

function toCandidate(value: unknown, rank: number): MarketplaceCandidate | null {
  if (!isRecord(value)) return null;
  const id = parseItemId(value.item_id ?? value.itemId ?? value.id);
  const rawTitle = value.title ?? value.name ?? value.image_alt;
  const title = typeof rawTitle === "string" ? rawTitle.replace(/\s+/g, " ").trim() : "";
  const displayedPrice = parsePrice(value.price_jpy ?? value.price);
  if (!id || !title || displayedPrice === null) return null;
  return {
    source: MARKETPLACE_IDS.yahooFurima,
    rank,
    title,
    displayedPrice,
    url: `${SEARCH_ORIGIN}/item/${id}`,
    shopName: "unknown",
    availabilityText: "",
  };
}

function searchStateForKeyword(html: string, keyword: string): Record<string, unknown> | null {
  const $ = load(html);
  const text = $("script#__NEXT_DATA__").first().text();
  if (!text) return null;

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(root) || !isRecord(root.props) || !isRecord(root.props.initialState)) return null;
  const initialState = root.props.initialState;
  if (!isRecord(initialState.searchState) || !isRecord(initialState.searchState.search)) return null;
  const search = initialState.searchState.search;
  if (!isRecord(search.searchParams) || !isRecord(search.result) || !isRecord(search.result.requestMetadata)) return null;
  const searchQuery = search.searchParams.query;
  const requestQuery = search.result.requestMetadata.query;
  if (typeof searchQuery !== "string" || typeof requestQuery !== "string"
    || normalizeQuery(searchQuery) !== normalizeQuery(keyword)
    || normalizeQuery(requestQuery) !== normalizeQuery(keyword)) return null;
  return search.result;
}

function searchItemsFromNextData(html: string, keyword: string, maxCards: number): MarketplaceCandidate[] {
  const searchResult = searchStateForKeyword(html, keyword);
  if (!searchResult || !Array.isArray(searchResult.items)) return [];
  const items = searchResult.items;
  const candidates: MarketplaceCandidate[] = [];
  const seenIds = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || item.itemStatus !== "OPEN") continue;
    const candidate = toCandidate(item, candidates.length + 1);
    if (!candidate) continue;
    const id = candidate.url.slice(candidate.url.lastIndexOf("/") + 1);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    candidates.push(candidate);
    if (candidates.length >= maxCards) break;
  }
  return candidates;
}

function itemIdFromHref(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, SEARCH_ORIGIN);
    if (url.origin !== SEARCH_ORIGIN) return null;
    return /^\/item\/([A-Za-z0-9_-]{3,80})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function searchItemsFromHtml(html: string, keyword: string, maxCards: number): MarketplaceCandidate[] {
  const $ = load(html);
  if (!searchStateForKeyword(html, keyword)) return [];

  const resultsRoot = $("#itm").first();
  if (!resultsRoot.length) return [];

  const candidates: MarketplaceCandidate[] = [];
  const seenIds = new Set<string>();
  resultsRoot.find('a[href*="/item/"]').each((_, element) => {
    if (candidates.length >= maxCards) return;
    const anchor = $(element);
    const id = itemIdFromHref(anchor.attr("href"));
    if (!id || seenIds.has(id)) return;
    const title = anchor.find("img[alt]").first().attr("alt")?.trim()
      || anchor.find("p").last().text().trim();
    const priceText = anchor.find("p").toArray().map((paragraph) => $(paragraph).text()).find((value) => /(?:[¥￥]\s*[\d,]+|[\d,]+\s*円)/.test(value))
      ?? anchor.text();
    const candidate = toCandidate({ id, title, price: priceText }, candidates.length + 1);
    if (!candidate) return;
    seenIds.add(id);
    candidates.push(candidate);
  });
  return candidates;
}

export function parseYahooFurimaSearchPage(html: string, keyword: string, maxCards = 30): ParsedYahooFurimaPage {
  const limit = Math.min(Math.max(Math.floor(maxCards), 0), 30);
  if (!normalizeQuery(keyword) || limit === 0) return { candidates: [], extraction: "none" };

  const jsonCandidates = searchItemsFromNextData(html, keyword, limit);
  if (jsonCandidates.length) return { candidates: jsonCandidates, extraction: "next_data" };

  const htmlCandidates = searchItemsFromHtml(html, keyword, limit);
  return htmlCandidates.length
    ? { candidates: htmlCandidates, extraction: "html" }
    : { candidates: [], extraction: "none" };
}

function searchUrl(keyword: string): string {
  return `${SEARCH_ORIGIN}/search/${encodeURIComponent(keyword)}`;
}

function emptyResult(keyword: string, url: string, error: string): SearchSnapshot["sources"][number] {
  return { source: MARKETPLACE_IDS.yahooFurima, keyword, searchUrl: url, error, candidates: [] };
}

async function searchYahooFurima(args: MarketplaceSearchInput): Promise<SearchSnapshot["sources"][number]> {
  const keyword = buildMarketplaceKeyword(args.keyword);
  const url = searchUrl(keyword);
  if (!keyword) return emptyResult(keyword, url, "invalid_query: Yahoo!フリマ search keyword is empty.");
  if (!env.yahooFurimaDataLicenseVerified) {
    return emptyResult(keyword, url, "configuration_error: Yahoo!フリマ data-use authorization is not verified.");
  }

  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = args.signal ? AbortSignal.any([args.signal, timeoutSignal]) : timeoutSignal;
  try {
    const response = await fetchWithHttpMetrics(fetch, url, {
      method: "GET",
      headers: { Accept: "text/html" },
      redirect: "manual",
      signal,
    }, {
      ...(args.onRequest ? { onRequest: args.onRequest } : {}),
      ...(args.onHttpRequestStarted ? { onHttpRequestStarted: args.onHttpRequestStarted } : {}),
      ...(args.onHttpRequestCompleted ? { onHttpRequestCompleted: args.onHttpRequestCompleted } : {}),
    });
    if (!response.ok) {
      return emptyResult(keyword, url, `upstream_error: Yahoo!フリマ returned HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html/i.test(contentType)) {
      return emptyResult(keyword, url, "invalid_response: Yahoo!フリマ search response was not HTML.");
    }

    const html = await response.text();
    const parsed = parseYahooFurimaSearchPage(html, keyword, args.maxCards);
    return {
      source: MARKETPLACE_IDS.yahooFurima,
      keyword,
      searchUrl: url,
      error: null,
      candidates: parsed.candidates,
      diagnostics: [{ extraction: parsed.extraction, candidateCount: parsed.candidates.length }],
    };
  } catch (error) {
    if (args.signal?.aborted) throw args.signal.reason instanceof Error ? args.signal.reason : new Error("Yahoo!フリマ search canceled.");
    const message = signal.aborted
      ? "timeout: Yahoo!フリマ search request timed out."
      : "network_error: Yahoo!フリマ search request failed.";
    return emptyResult(keyword, url, message);
  }
}

export const yahooFurimaProvider: HttpMarketplaceProvider = {
  source: MARKETPLACE_IDS.yahooFurima,
  runtime: "http",
  supportsProfile: () => true,
  search: searchYahooFurima,
};