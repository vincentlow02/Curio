import type { RakutenListingCandidate, SearchSnapshot } from "../../../price/types";
import { env } from "../../config/env";
import { fetchRakutenItems, RAKUTEN_ITEM_SEARCH_ENDPOINT, RakutenApiError } from "./rakuten-api-client";
import { buildMarketplaceKeyword } from "./shared/keyword";
import type { HttpMarketplaceProvider } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeItemUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function mapRakutenItems(items: unknown[], maxCards = 30): RakutenListingCandidate[] {
  const candidates: RakutenListingCandidate[] = [];
  const seenUrls = new Set<string>();
  for (const value of items.slice(0, Math.min(Math.max(maxCards, 0), 30))) {
    if (!isRecord(value)) continue;
    const title = typeof value.itemName === "string" ? value.itemName.replace(/\s+/g, " ").trim() : "";
    const url = safeItemUrl(value.itemUrl);
    if (!title || !url || seenUrls.has(url)) continue;
    const priceValue = typeof value.itemPrice === "number" ? value.itemPrice : Number.NaN;
    const displayedPrice = Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : null;
    const availabilityText = value.availability === 0 ? "sold_out" : value.availability === 1 ? "" : "unknown";
    const shopName = typeof value.shopName === "string" && value.shopName.trim() ? value.shopName.trim() : "unknown";
    candidates.push({ source: "Rakuten", rank: candidates.length + 1, title, displayedPrice, url, shopName, availabilityText });
    seenUrls.add(url);
  }
  return candidates;
}

async function searchRakutenApi(args: { keyword: string; maxCards: number; signal?: AbortSignal }): Promise<SearchSnapshot["sources"][number]> {
  const keyword = buildMarketplaceKeyword(args.keyword);
  try {
    const response = await fetchRakutenItems(keyword, args.signal ? { signal: args.signal } : {});
    return {
      source: "Rakuten",
      keyword,
      searchUrl: RAKUTEN_ITEM_SEARCH_ENDPOINT,
      error: null,
      candidates: mapRakutenItems(response.items, args.maxCards),
    };
  } catch (error) {
    if (args.signal?.aborted) throw args.signal.reason instanceof Error ? args.signal.reason : new Error("Rakuten API search was canceled.");
    const safeMessage = error instanceof RakutenApiError
      ? `${error.kind}: ${error.message}${error.retryAfterSeconds ? ` Retry after ${error.retryAfterSeconds} seconds.` : ""}`
      : "upstream_error: Rakuten API request failed.";
    return { source: "Rakuten", keyword, searchUrl: RAKUTEN_ITEM_SEARCH_ENDPOINT, error: safeMessage, candidates: [] };
  }
}

export const rakutenProvider: HttpMarketplaceProvider = {
  source: "Rakuten",
  runtime: "http",
  supportsProfile: () => true,
  search: searchRakutenApi,
};
