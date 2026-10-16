import { MAX_DISCOVERY_LISTINGS, type MarketplaceDiscoveryResult } from "../core/analysis/types";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../core/marketplace";
import type { ItemProfile } from "./item-profile";
import { classifyIdentityMatch, matchProductType, normalizeIdentity } from "./identity";
import type { MarketplaceCandidate, SearchSnapshot } from "./types";

const MAX_DISCOVERY_LISTINGS_PER_SOURCE = 8;
const MAX_CANDIDATES_SCANNED_PER_SOURCE = 30;
type DiscoveryAvailability = MarketplaceDiscoveryResult["availability"];
type DiscoveryCondition = MarketplaceDiscoveryResult["condition"];
type DiscoveryMatchConfidence = MarketplaceDiscoveryResult["matchConfidence"];

const DAMAGED_ITEM = /ジャンク|故障|動作不良|動作未確認|通電のみ|部品取り|訳あり|訳アリ|アウトレット/i;
const NEW_ITEM = /新品|未使用|未開封/i;
const SOLD_OUT = /売り切れ|売切れ|販売終了|在庫なし|sold[_ ]?out|out of stock/i;
const IN_STOCK = /在庫あり|在庫有り|in stock/i;
const TRACKING_PARAMETERS = /^(?:utm_.+|tracking|scid|yclid|gclid|fbclid)$/i;

type ProductUrl = { href: string; key: string };

function productUrl(value: string): ProductUrl | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return { href: url.href, key: `${url.origin}${url.pathname}${url.search}` };
  } catch {
    return null;
  }
}

function safeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function surugayaDiscoveryFor(source: SearchSnapshot["sources"][number]): Map<string, { price: number; availability: DiscoveryAvailability }> {
  const diagnostic = source.diagnostics?.find((entry) => entry.kind === "listing_discovery");
  if (!diagnostic || !Array.isArray(diagnostic.listings)) return new Map();

  const listings = new Map<string, { price: number; availability: DiscoveryAvailability }>();
  for (const value of diagnostic.listings) {
    if (!isRecord(value) || typeof value.url !== "string" || typeof value.price !== "number" || !Number.isFinite(value.price) || value.price <= 0) continue;
    const url = productUrl(value.url);
    if (!url) continue;
    const availability = value.availability === "IN_STOCK"
      ? "available"
      : value.availability === "OUT_OF_STOCK" ? "sold_out" : "unknown";
    listings.set(url.key, { price: value.price, availability });
  }
  return listings;
}

function availabilityFor(candidate: MarketplaceCandidate, diagnostic?: { availability: DiscoveryAvailability }): DiscoveryAvailability {
  if (diagnostic) return diagnostic.availability;
  if (candidate.availabilityStatus === "available") return "available";
  if (candidate.availabilityStatus === "unknown") return "unknown";
  if (candidate.availabilityStatus === "sold_out" || SOLD_OUT.test(candidate.availabilityText)) return "sold_out";
  if (candidate.availabilityText && candidate.availabilityText !== "unknown" && IN_STOCK.test(candidate.availabilityText)) return "available";
  if (candidate.source === MARKETPLACE_IDS.yahooShopping && candidate.availabilityText === "") return "available";
  return "unknown";
}

function conditionFor(candidate: MarketplaceCandidate): DiscoveryCondition {
  if (candidate.listingCondition === "used" || candidate.listingCondition === "new") return candidate.listingCondition;
  return NEW_ITEM.test(candidate.title) ? "new" : "unknown";
}

function hasIdentityCue(profile: ItemProfile, title: string): boolean {
  const normalizedTitle = normalizeIdentity(title);
  if (profile.pokemonCard) return normalizedTitle.includes(normalizeIdentity(profile.pokemonCard.cardName));
  const modelTokens = `${profile.itemName} ${profile.versionOrPeriod} ${profile.priceSearchKeywordJa}`
    .normalize("NFKC")
    .match(/[A-Za-z]{2,}[\s-]?\d{2,}/g) ?? [];
  return modelTokens.some((model) => {
    const family = /^[A-Za-z]{2,}/.exec(model)?.[0];
    return Boolean(family && normalizedTitle.includes(normalizeIdentity(family)));
  });
}

function quality(listing: MarketplaceDiscoveryResult): number {
  return Number(listing.matchConfidence === "exact")
    + Number(listing.price !== null)
    + Number(listing.imageUrl !== null)
    + Number(listing.availability !== "unknown")
    + Number(listing.condition !== "unknown");
}

function toDiscoveryResult(
  profile: ItemProfile,
  source: MarketplaceSource,
  candidate: MarketplaceCandidate,
  surugayaListings: Map<string, { price: number; availability: DiscoveryAvailability }>,
): { listing: MarketplaceDiscoveryResult; urlKey: string } | null {
  const title = candidate.title.trim();
  const url = productUrl(candidate.url);
  if (!title || !url) return null;

  const identity = classifyIdentityMatch(profile, title);
  const productType = matchProductType(profile, title);
  if (productType === "conflict") return null;
  if (identity === "conflict" || (identity === "unknown" && !hasIdentityCue(profile, title))) return null;

  const surugayaListing = candidate.source === MARKETPLACE_IDS.surugayaYahooStore
    ? surugayaListings.get(url.key)
    : undefined;
  const candidatePrice = candidate.displayedPrice;
  const price = candidatePrice !== null && Number.isFinite(candidatePrice) && candidatePrice > 0
    ? candidatePrice
    : surugayaListing?.price ?? null;

  return {
    urlKey: url.key,
    listing: {
      source,
      title,
      url: url.href,
      imageUrl: safeImageUrl(candidate.imageUrl),
      price,
      currency: "JPY",
      shopName: candidate.shopName.trim() && candidate.shopName !== "unknown" ? candidate.shopName.trim() : null,
      availability: availabilityFor(candidate, surugayaListing),
      condition: conditionFor(candidate),
      matchConfidence: identity === "match" && (productType === "match" || Boolean(profile.pokemonCard)) ? "exact" : "possible",
      damaged: DAMAGED_ITEM.test(title),
    },
  };
}

export function buildDiscoveryResults(profile: ItemProfile, snapshot: SearchSnapshot): MarketplaceDiscoveryResult[] {
  const byUrl = new Map<string, MarketplaceDiscoveryResult>();
  for (const source of snapshot.sources) {
    if (source.error) continue;
    const surugayaListings = surugayaDiscoveryFor(source);
    for (const candidate of source.candidates.slice(0, MAX_CANDIDATES_SCANNED_PER_SOURCE)) {
      if (candidate.source !== source.source) continue;
      const result = toDiscoveryResult(profile, source.source, candidate, surugayaListings);
      if (!result) continue;
      const current = byUrl.get(result.urlKey);
      if (!current || quality(result.listing) > quality(current)) byUrl.set(result.urlKey, result.listing);
    }
  }

  const perSource = new Map<MarketplaceSource, number>();
  const listings: MarketplaceDiscoveryResult[] = [];
  for (const listing of byUrl.values()) {
    const sourceCount = perSource.get(listing.source) ?? 0;
    if (sourceCount >= MAX_DISCOVERY_LISTINGS_PER_SOURCE) continue;
    listings.push(listing);
    perSource.set(listing.source, sourceCount + 1);
    if (listings.length >= MAX_DISCOVERY_LISTINGS) break;
  }
  return listings;
}
