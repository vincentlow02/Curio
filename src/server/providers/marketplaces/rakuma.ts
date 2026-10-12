import "server-only";

import { load } from "cheerio";

import { MARKETPLACE_IDS } from "../../../core/marketplace";
import type { MarketplaceCandidate, SearchSnapshot } from "../../../price/types";
import { fetchWithHttpMetrics } from "../../analysis/marketplace-cost-tracker";
import { env } from "../../config/env";
import { buildMarketplaceKeyword } from "./shared/keyword";
import type { HttpMarketplaceProvider, MarketplaceSearchInput } from "./types";

const SEARCH_ORIGIN = "https://fril.jp";
const ITEM_ORIGIN = "https://item.fril.jp";
const REQUEST_TIMEOUT_MS = 12_000;

export type RakumaSearchResult = {
  candidates: MarketplaceCandidate[];
  itemBoxCount: number;
  soldOutCount: number;
  rejectedCount: number;
  error: string | null;
};

function normalizeQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("ja-JP");
}

function itemUrl(value: string | undefined): { id: string; url: string } | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, SEARCH_ORIGIN);
    const id = /^\/([a-f0-9]{32})\/?$/i.exec(parsed.pathname)?.[1];
    if (parsed.protocol !== "https:" || parsed.hostname !== "item.fril.jp" || !id) return null;
    return { id: id.toLowerCase(), url: `${ITEM_ORIGIN}/${id.toLowerCase()}` };
  } catch {
    return null;
  }
}

function positivePrice(value: string | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const price = Number(digits);
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

export function parseRakumaSearchPage(html: string, keyword: string, maxCards = 30): RakumaSearchResult {
  const limit = Math.min(Math.max(Math.floor(maxCards), 0), 30);
  const empty = { candidates: [], itemBoxCount: 0, soldOutCount: 0, rejectedCount: 0, error: null };
  if (!normalizeQuery(keyword) || limit === 0) return empty;

  const $ = load(html);
  const canonical = $("link[rel='canonical']").attr("href");
  try {
    const pageUrl = new URL(canonical ?? "", SEARCH_ORIGIN);
    if (pageUrl.origin !== SEARCH_ORIGIN || pageUrl.pathname !== "/s"
      || normalizeQuery(pageUrl.searchParams.get("query") ?? "") !== normalizeQuery(keyword)) {
      return { ...empty, error: "invalid_response: Rakuma canonical URL does not match the search keyword." };
    }
  } catch {
    return { ...empty, error: "invalid_response: Rakuma search page has no valid canonical URL." };
  }

  const boxes = $(".item-list .item-box");
  const candidates: MarketplaceCandidate[] = [];
  const seenIds = new Set<string>();
  let soldOutCount = 0;
  let rejectedCount = 0;
  boxes.each((_, element) => {
    if (candidates.length >= limit) return;
    const box = $(element);
    const cardText = box.text();
    if (box.find(".item-box__soldout_ribbon").length > 0 || /SOLD\s*OUT|売り切れ|売切れ/.test(cardText)) {
      soldOutCount += 1;
      return;
    }

    const link = box.find('a[href*="item.fril.jp"]').first();
    const item = itemUrl(link.attr("href"));
    const title = box.find(".item-box__item-name span").first().text().replace(/\s+/g, " ").trim()
      || box.find(".item-box__item-name").first().text().replace(/\s+/g, " ").trim()
      || box.find("a.link_search_title[title]").first().attr("title")?.trim()
      || "";
    const priceElement = box.find("p.item-box__item-price").first();
    const dataContent = priceElement.find('span[data-content]:not([data-content="JPY"])').first().attr("data-content");
    const priceText = priceElement.text().replace(/\s+/g, " ").trim();
    const price = positivePrice(dataContent || priceText);
    if (!item || !title || price === null || seenIds.has(item.id)) {
      rejectedCount += 1;
      return;
    }

    seenIds.add(item.id);
    candidates.push({
      source: MARKETPLACE_IDS.rakuma,
      rank: candidates.length + 1,
      title,
      displayedPrice: price,
      url: item.url,
      shopName: "unknown",
      availabilityText: "",
      listingCondition: "unknown",
    });
  });
  return { candidates, itemBoxCount: boxes.length, soldOutCount, rejectedCount, error: null };
}

function emptySource(keyword: string, searchUrl: string, error: string): SearchSnapshot["sources"][number] {
  return { source: MARKETPLACE_IDS.rakuma, keyword, searchUrl, error, candidates: [] };
}

async function searchRakuma(args: MarketplaceSearchInput): Promise<SearchSnapshot["sources"][number]> {
  const keyword = buildMarketplaceKeyword(args.keyword);
  const url = new URL("/s", SEARCH_ORIGIN);
  if (keyword) url.searchParams.set("query", keyword);
  if (!keyword) return emptySource(keyword, url.href, "invalid_query: Rakuma search keyword is empty.");
  if (!env.rakumaDataLicenseVerified) {
    return emptySource(keyword, url.href, "configuration_error: Rakuma data-use authorization is not verified.");
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
    if (!response.ok) return emptySource(keyword, url.href, `upstream_error: Rakuma returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html/i.test(contentType)) return emptySource(keyword, url.href, "invalid_response: Rakuma search response was not HTML.");

    const parsed = parseRakumaSearchPage(await response.text(), keyword, args.maxCards);
    return {
      source: MARKETPLACE_IDS.rakuma,
      keyword,
      searchUrl: url.href,
      error: parsed.error,
      candidates: parsed.candidates,
      diagnostics: [{ itemBoxCount: parsed.itemBoxCount, soldOutCount: parsed.soldOutCount, rejectedCount: parsed.rejectedCount }],
    };
  } catch {
    if (args.signal?.aborted) throw args.signal.reason instanceof Error ? args.signal.reason : new Error("Rakuma search canceled.");
    return emptySource(keyword, url.href, signal.aborted ? "timeout: Rakuma search request timed out." : "network_error: Rakuma search request failed.");
  }
}

export const rakumaProvider: HttpMarketplaceProvider = {
  source: MARKETPLACE_IDS.rakuma,
  runtime: "http",
  supportsProfile: () => true,
  search: searchRakuma,
};