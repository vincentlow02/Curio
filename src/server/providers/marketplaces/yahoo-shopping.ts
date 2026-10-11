import "server-only";

import type { ItemProfile } from "../../../price/item-profile";
import { classifyIdentityMatch } from "../../../price/identity";
import type { RakutenListingCandidate, SearchSnapshot } from "../../../price/types";
import { env } from "../../config/env";
import { fetchYahooShoppingItems, YAHOO_SHOPPING_ITEM_SEARCH_ENDPOINT, YahooShoppingApiError, type YahooShoppingHit } from "./yahoo-shopping-api-client";
import type { HttpMarketplaceProvider } from "./types";

const MIN_MATCHED_CANDIDATES = 5;

function cleanQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/["“”「」『』]/g, " ")
    .replace(/(?:中古品?|価格|USED|UNKNOWN)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildYahooShoppingQueries(profile: ItemProfile): string[] {
  const precise = cleanQuery(profile.priceSearchKeywordJa || `${profile.itemName} ${profile.versionOrPeriod}`);
  const relaxed = [...new Set(cleanQuery(`${profile.brandCharacterSeries} ${profile.itemName}`).split(" ").filter(Boolean))].join(" ");
  return [...new Set([precise, relaxed].filter(Boolean))];
}

type YahooCandidateEntry = {
  candidate: RakutenListingCandidate;
  queryIndex: number;
  sequence: number;
};

function safeItemUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function mapHit(hit: YahooShoppingHit, seenCodes: Set<string>, seenUrls: Set<string>): RakutenListingCandidate | null {
  const title = typeof hit.name === "string" ? hit.name.replace(/\s+/g, " ").trim() : "";
  const url = safeItemUrl(hit.url);
  if (!title || !url || hit.condition !== "used" || seenUrls.has(url)) return null;
  const code = typeof hit.code === "string" ? hit.code.trim() : "";
  const sellerId = typeof hit.seller?.sellerId === "string" ? hit.seller.sellerId.trim() : "";
  const externalId = code ? `${sellerId}:${code}` : "";
  if (externalId && seenCodes.has(externalId)) return null;

  const price = typeof hit.price === "number" && Number.isFinite(hit.price) && hit.price >= 0 ? hit.price : null;
  const shopName = typeof hit.seller?.name === "string" && hit.seller.name.trim() ? hit.seller.name.trim() : "unknown";
  seenUrls.add(url);
  if (externalId) seenCodes.add(externalId);
  return {
    source: "Yahoo! Shopping",
    rank: 0,
    title,
    displayedPrice: price,
    url,
    shopName,
    availabilityText: hit.inStock === false ? "在庫なし" : hit.inStock === true ? "" : "unknown",
    listingCondition: "used",
  };
}

function isUsableCandidate(profile: ItemProfile, candidate: RakutenListingCandidate): boolean {
  return candidate.displayedPrice !== null
    && candidate.displayedPrice > 0
    && candidate.availabilityText !== "在庫なし"
    && candidate.availabilityText !== "unknown"
    && candidate.listingCondition === "used"
    && classifyIdentityMatch(profile, candidate.title) === "match";
}

function safeError(error: unknown): string {
  if (error instanceof YahooShoppingApiError) return `${error.kind}: ${error.message}`;
  return "upstream_error: Yahoo! Shopping search failed.";
}

async function searchYahooShopping(args: {
  profile: ItemProfile;
  keyword: string;
  maxCards: number;
  signal?: AbortSignal;
  onRequest?: () => void;
}): Promise<SearchSnapshot["sources"][number]> {
  const queries = buildYahooShoppingQueries(args.profile);
  const limit = Math.min(Math.max(args.maxCards, 0), 30);
  if (!queries.length || !limit) {
    return {
      source: "Yahoo! Shopping",
      keyword: "",
      searchUrl: YAHOO_SHOPPING_ITEM_SEARCH_ENDPOINT,
      error: "invalid_query: Yahoo! Shopping search query is empty.",
      candidates: [],
    };
  }

  const entries: YahooCandidateEntry[] = [];
  const seenCodes = new Set<string>();
  const seenUrls = new Set<string>();
  const queriesUsed: string[] = [];
  let error: string | null = null;
  const target = Math.min(MIN_MATCHED_CANDIDATES, limit);

  for (const [queryIndex, query] of queries.slice(0, 2).entries()) {
    queriesUsed.push(query);
    try {
      const response = await fetchYahooShoppingItems(query, {
        ...(args.signal ? { signal: args.signal } : {}),
        ...(args.onRequest ? { onRequest: args.onRequest } : {}),
      });
      for (const hit of response.hits.slice(0, limit)) {
        const candidate = mapHit(hit, seenCodes, seenUrls);
        if (candidate) entries.push({ candidate, queryIndex, sequence: entries.length });
      }
    } catch (caught) {
      if (args.signal?.aborted) throw args.signal.reason instanceof Error ? args.signal.reason : new Error("Yahoo! Shopping search canceled.");
      error = safeError(caught);
      break;
    }

    const matchedCount = entries.filter(({ candidate }) => isUsableCandidate(args.profile, candidate)).length;
    if (matchedCount >= target || queryIndex === 1) break;
  }

  const candidates = entries
    .sort((left, right) => {
      const leftMatch = classifyIdentityMatch(args.profile, left.candidate.title);
      const rightMatch = classifyIdentityMatch(args.profile, right.candidate.title);
      const priority = (status: typeof leftMatch): number => status === "match" ? 0 : status === "unknown" ? 1 : 2;
      return priority(leftMatch) - priority(rightMatch) || left.queryIndex - right.queryIndex || left.sequence - right.sequence;
    })
    .slice(0, limit)
    .map(({ candidate }, index) => ({ ...candidate, rank: index + 1 }));

  return {
    source: "Yahoo! Shopping",
    keyword: queriesUsed.join(" | "),
    searchUrl: YAHOO_SHOPPING_ITEM_SEARCH_ENDPOINT,
    error,
    candidates,
  };
}

export const yahooShoppingProvider: HttpMarketplaceProvider = {
  source: "Yahoo! Shopping",
  runtime: "http",
  supportsProfile: () => env.yahooShoppingApiEnabled,
  search: searchYahooShopping,
};