import "server-only";

import type { ItemProfile } from "../../../price/item-profile";
import { MARKETPLACE_IDS } from "../../../core/marketplace";
import { classifyIdentityMatch } from "../../../price/identity";
import { countComparableMarketplaceSamples } from "../../../price/matcher";
import type { MarketplaceCandidate, SearchSnapshot } from "../../../price/types";
import { readYahooSellerContributionRates } from "../../analysis/marketplace-cost-store";
import { env } from "../../config/env";
import { fetchYahooShoppingItems, YAHOO_SHOPPING_ITEM_SEARCH_ENDPOINT, YahooShoppingApiError, type YahooShoppingHit } from "./yahoo-shopping-api-client";
import type { HttpMarketplaceProvider, MarketplaceSearchInput } from "./types";

type YahooShoppingStoreCategory = "electronics" | "smartphones" | "cameras" | "camera_lenses" | "photography_equipment" | "computers" | "gaming" | "watches" | "jewelry" | "luxury_bags" | "fashion" | "designer_fashion" | "vintage_clothing" | "shoes" | "bags" | "outdoor" | "sports" | "accessories" | "home_goods";

type YahooShoppingStoreConfig = {
  storeId: string;
  storeName: string;
  channel: "yahoo-shopping";
  sellerId: string;
  categories: readonly YahooShoppingStoreCategory[];
};

export const YAHOO_SHOPPING_STORES = {
  janpara: {
    storeId: "janpara",
    storeName: "じゃんぱら",
    channel: "yahoo-shopping",
    sellerId: "janpara",
    categories: ["electronics", "cameras", "computers", "gaming"],
  },
  komehyo: {
    storeId: "komehyo",
    storeName: "KOMEHYO",
    channel: "yahoo-shopping",
    sellerId: "komehyo",
    categories: ["watches", "jewelry", "luxury_bags", "fashion"],
  },
  brandOff: {
    storeId: "brandoff",
    storeName: "ブランドオフ",
    channel: "yahoo-shopping",
    sellerId: "brandoff",
    categories: ["luxury_bags", "bags", "watches", "jewelry", "fashion", "shoes", "accessories"],
  },
  secondStreet: {
    storeId: "ssol-shopping",
    storeName: "2nd STREET",
    channel: "yahoo-shopping",
    sellerId: "ssol-shopping",
    categories: ["fashion", "shoes", "bags", "outdoor", "sports", "accessories", "home_goods"],
  },
  sofmapUsed: {
    storeId: "u-sofmap",
    storeName: "株式会社ソフマップ",
    channel: "yahoo-shopping",
    sellerId: "u-sofmap",
    categories: ["electronics", "smartphones", "computers", "cameras", "gaming"],
  },
  kitamura: {
    storeId: "emedama",
    storeName: "カメラのキタムラ",
    channel: "yahoo-shopping",
    sellerId: "emedama",
    categories: ["cameras", "camera_lenses", "photography_equipment"],
  },
  mapCamera: {
    storeId: "ymapcamera",
    storeName: "マップカメラ",
    channel: "yahoo-shopping",
    sellerId: "ymapcamera",
    categories: ["cameras", "camera_lenses", "photography_equipment"],
  },
  ragtag: {
    storeId: "ragtagonlineshop",
    storeName: "RAGTAG",
    channel: "yahoo-shopping",
    sellerId: "ragtagonlineshop",
    categories: ["designer_fashion", "vintage_clothing", "shoes", "accessories", "bags"],
  },
  kindal: {
    storeId: "kindal",
    storeName: "カインドオル",
    channel: "yahoo-shopping",
    sellerId: "kindal",
    categories: ["designer_fashion", "vintage_clothing", "fashion", "shoes", "bags", "accessories"],
  },
} as const satisfies Record<string, YahooShoppingStoreConfig>;

type YahooShoppingStore = (typeof YAHOO_SHOPPING_STORES)[keyof typeof YAHOO_SHOPPING_STORES];

const CATEGORY_PATTERNS: Record<YahooShoppingStoreCategory, RegExp> = {
  electronics: /\b(?:electronics?|digital camera)\b|電子機器|家電/i,
  smartphones: /\b(?:smartphones?|mobile phones?|iphones?|android|samsung galaxy|pixel phones?)\b|スマートフォン|スマホ|携帯電話|アイフォン/i,
  cameras: /\b(?:cameras?|canon eos|nikon|nikkor|eos|dslr|mirrorless|sony alpha|fujifilm|lumix)\b|カメラ|レンズ|一眼レフ|ミラーレス/i,
  camera_lenses: /\b(?:camera )?lenses?\b|\bnikkor\b|\b(?:rf|ef|zf|fe|e|x)-?\d{1,3}(?:mm)?\b|交換レンズ|レンズ/i,
  photography_equipment: /\bphotography equipment\b|\b(?:tripods?|monopods?|camera flashes?|speedlights?|camera bags?|camera filters?)\b|三脚|一脚|ストロボ|フラッシュ|照明機材|撮影機材|カメラアクセサリー/i,
  computers: /\b(?:computers?|laptops?|desktops?|pc)\b|パソコン|ノートパソコン/i,
  gaming: /\b(?:gaming|video games?|playstation|nintendo|xbox|psp|ps[345])\b|ゲーム/i,
  watches: /\b(?:watches?|rolex|omega|cartier|tudor|patek|seiko|breitling|iwc)\b|時計|ウォッチ/i,
  jewelry: /\b(?:jewel(?:ry|lery)|diamonds?|rings?|necklaces?|bracelets?|earrings?)\b|ジュエリー|宝石|ダイヤ|指輪|リング|ネックレス|ブレスレット|ピアス|イヤリング/i,
  luxury_bags: /\b(?:bags?|handbags?|wallets?|purses?|louis vuitton|chanel|hermes|gucci|prada|dior)\b|バッグ|鞄|財布|ハンドバッグ|ブランドバッグ/i,
  fashion: /\b(?:fashion|apparel|clothing|dresses?|coats?|jackets?|shirts?|shoes|sneakers)\b|ファッション|アパレル|洋服|衣類|ワンピース|ドレス|コート|ジャケット|シャツ|スーツ|靴|スニーカー/i,
  designer_fashion: /\b(?:comme des garcons|yohji yamamoto|issey miyake|junya watanabe|maison margiela|undercover|sacai|dries van noten)\b|コムデギャルソン|ヨウジヤマモト|山本耀司|イッセイミヤケ|ジュンヤワタナベ/i,
  vintage_clothing: /\bvintage (?:clothing|clothes?|coat|jacket|shirt|dress|jeans|denim|skirt|sweater)\b|\b(?:coat|jacket|shirt|dress|jeans|denim|skirt|sweater) vintage\b|古着|ヴィンテージ(?:の)?(?:服|衣類|コート|ジャケット|シャツ|ドレス|デニム)|ビンテージ(?:の)?(?:服|衣類|コート|ジャケット|シャツ|ドレス|デニム)|中古衣料/i,
  shoes: /\bshoes?\b|sneakers?|boots?|sandals?|ヒール|シューズ|靴|スニーカー|ブーツ|サンダル/i,
  bags: /\bbags?\b|backpacks?|totes?|rucksacks?|バッグ|鞄|リュック|バックパック|トート/i,
  outdoor: /\boutdoor\b|camping|hiking|tent|sleeping bag|アウトドア|キャンプ|登山|テント|寝袋/i,
  sports: /\bsports?\b|soccer|football|baseball|basketball|golf|tennis|cycling|スポーツ|サッカー|野球|バスケ|ゴルフ|テニス|自転車/i,
  accessories: /\baccessor(?:y|ies)\b|sunglasses|belts?|scarves?|hats?|アクセサリー|サングラス|ベルト|スカーフ|帽子/i,
  home_goods: /\bhome goods?\b|furniture|interior|kitchenware|tableware|家電|家具|インテリア|キッチン用品|食器|生活雑貨/i,
};

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
  candidate: MarketplaceCandidate;
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

function urlKey(value: string, sellerId: string): string {
  const url = new URL(value);
  return `${sellerId.toLowerCase()}|${url.origin}${url.pathname}`;
}

function profileText(profile: ItemProfile): string {
  return [
    profile.itemName,
    profile.brandCharacterSeries,
    profile.versionOrPeriod,
    profile.priceSearchKeywordJa,
    ...profile.searchKeywordsJa,
    ...profile.notes,
  ].join(" ").normalize("NFKC");
}

function isProfileRelevantToStore(profile: ItemProfile, store: YahooShoppingStore): boolean {
  const text = profileText(profile);
  return store.categories.some((category) => CATEGORY_PATTERNS[category].test(text));
}

function isStoreSearchEnabled(store: YahooShoppingStore): boolean {
  return store.storeId !== YAHOO_SHOPPING_STORES.janpara.storeId || env.janparaYahooShoppingStoreSearchEnabled;
}

function configuredStoreForHit(hit: YahooShoppingHit): YahooShoppingStore | undefined {
  const sellerId = typeof hit.seller?.sellerId === "string" ? hit.seller.sellerId.trim().toLowerCase() : "";
  const url = safeItemUrl(hit.url);
  const parsed = url ? new URL(url) : null;
  return Object.values(YAHOO_SHOPPING_STORES).find((store) => sellerId === store.sellerId
    || (parsed?.hostname === "store.shopping.yahoo.co.jp" && parsed.pathname.startsWith(`/${store.storeId}/`)));
}

function isStoreListing(hit: YahooShoppingHit, store: YahooShoppingStore): boolean {
  const url = safeItemUrl(hit.url);
  if (!url || hit.condition !== "used" || hit.inStock !== true) return false;
  const price = typeof hit.price === "number" ? hit.price : Number.NaN;
  const sellerId = typeof hit.seller?.sellerId === "string" ? hit.seller.sellerId.trim().toLowerCase() : "";
  const parsed = new URL(url);
  const storePath = `/${store.storeId}/`;
  return sellerId === store.sellerId
    && parsed.hostname === "store.shopping.yahoo.co.jp"
    && parsed.pathname.startsWith(storePath)
    && parsed.pathname.length > storePath.length
    && Number.isFinite(price)
    && price > 0;
}

function mapHit(hit: YahooShoppingHit, seenCodes: Set<string>, seenUrls: Set<string>, store?: YahooShoppingStore): MarketplaceCandidate | null {
  const title = typeof hit.name === "string" ? hit.name : "";
  const url = safeItemUrl(hit.url);
  if (!title.trim() || !url || hit.condition !== "used" || (store && !isStoreListing(hit, store))) return null;
  const sellerId = typeof hit.seller?.sellerId === "string" ? hit.seller.sellerId.trim() : "";
  const apiSellerName = typeof hit.seller?.name === "string" && hit.seller.name.trim() ? hit.seller.name : "";
  const listingKey = urlKey(url, sellerId || apiSellerName.trim().toLowerCase());
  if (seenUrls.has(listingKey)) return null;
  const code = typeof hit.code === "string" ? hit.code.trim() : "";
  const externalId = code ? `${sellerId}:${code}` : "";
  if (externalId && seenCodes.has(externalId)) return null;

  const price = typeof hit.price === "number" && Number.isFinite(hit.price) && hit.price >= 0 ? hit.price : null;
  const shopName = apiSellerName || store?.storeName || "unknown";
  seenUrls.add(listingKey);
  if (externalId) seenCodes.add(externalId);
  return {
    source: MARKETPLACE_IDS.yahooShopping,
    rank: 0,
    title,
    displayedPrice: price,
    url,
    shopName,
    ...(sellerId ? { sellerId } : {}),
    availabilityText: hit.inStock === false ? "在庫なし" : hit.inStock === true ? "" : "unknown",
    listingCondition: "used",
  };
}

async function searchYahooShoppingStore(
  query: string,
  store: YahooShoppingStore,
  args: MarketplaceSearchInput,
  seenCodes: Set<string>,
  seenUrls: Set<string>,
): Promise<MarketplaceCandidate[]> {
  const response = await fetchYahooShoppingItems(query, {
    ...(args.signal ? { signal: args.signal } : {}),
    ...(args.onRequest ? { onRequest: args.onRequest } : {}),
    ...(args.onHttpRequestStarted ? { onHttpRequestStarted: args.onHttpRequestStarted } : {}),
    ...(args.onHttpRequestCompleted ? { onHttpRequestCompleted: args.onHttpRequestCompleted } : {}),
    sellerId: store.sellerId,
    condition: "used",
    inStock: true,
    results: 30,
  });
  return response.hits.slice(0, 30)
    .map((hit) => mapHit(hit, seenCodes, seenUrls, store))
    .filter((candidate): candidate is MarketplaceCandidate => candidate !== null);
}

function safeError(error: unknown): string {
  if (error instanceof YahooShoppingApiError) return `${error.kind}: ${error.message}`;
  return "upstream_error: Yahoo! Shopping search failed.";
}

function stopsSearchAfterFailure(error: unknown): boolean {
  return error instanceof YahooShoppingApiError
    && (error.kind === "rate_limited" || /HTTP (?:401|403|407)\b/.test(error.message));
}

async function searchYahooShopping(args: {
  profile: ItemProfile;
  keyword: string;
  maxCards: number;
  signal?: AbortSignal;
  onRequest?: () => void;
  onHttpRequestStarted?: () => void;
  onHttpRequestCompleted?: (status: number | null, elapsedMs: number, blockingRelevant?: boolean) => void;
}): Promise<SearchSnapshot["sources"][number]> {
  const queries = buildYahooShoppingQueries(args.profile);
  const limit = Math.min(Math.max(args.maxCards, 0), 30);
  if (!queries.length || !limit) {
    return {
      source: MARKETPLACE_IDS.yahooShopping,
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
  const sellerSearchRequestCountById: Record<string, number> = {};
  const incrementalPricingSamplesBySellerId: Record<string, number> = {};
  let error: string | null = null;
  let stopSellerSearches = false;
  const target = Math.min(env.yahooShoppingTargetPricingSamples, limit);

  for (const [queryIndex, query] of queries.slice(0, 1).entries()) {
    queriesUsed.push(query);
    try {
      const response = await fetchYahooShoppingItems(query, {
        ...(args.signal ? { signal: args.signal } : {}),
        ...(args.onRequest ? { onRequest: args.onRequest } : {}),
        ...(args.onHttpRequestStarted ? { onHttpRequestStarted: args.onHttpRequestStarted } : {}),
        ...(args.onHttpRequestCompleted ? { onHttpRequestCompleted: args.onHttpRequestCompleted } : {}),
      });
      for (const hit of response.hits.slice(0, limit)) {
        const store = configuredStoreForHit(hit);
        if (store && !isStoreSearchEnabled(store)) continue;
        const candidate = mapHit(hit, seenCodes, seenUrls, store);
        if (candidate) entries.push({ candidate, queryIndex, sequence: entries.length });
      }
    } catch (caught) {
      if (args.signal?.aborted) throw args.signal.reason instanceof Error ? args.signal.reason : new Error("Yahoo! Shopping search canceled.");
      error = safeError(caught);
      stopSellerSearches = stopsSearchAfterFailure(caught);
      break;
    }

  }

  if (queries[0] && !stopSellerSearches) {
    const relevantStores = Object.values(YAHOO_SHOPPING_STORES).filter((store) =>
      isStoreSearchEnabled(store) && isProfileRelevantToStore(args.profile, store),
    );
    const history = await readYahooSellerContributionRates();
    const rankedStores = relevantStores
      .map((store, index) => ({ store, index }))
      .sort((left, right) => (history[right.store.sellerId] ?? 0) - (history[left.store.sellerId] ?? 0) || left.index - right.index)
      .map(({ store }) => store);
    const storesToSearch = env.yahooShoppingSearchAllRelevantStores ? rankedStores : rankedStores.slice(0, env.yahooShoppingMaxSellerSearches);
    for (const store of storesToSearch) {
      const matchedCount = countComparableMarketplaceSamples(args.profile, MARKETPLACE_IDS.yahooShopping, entries.map(({ candidate }) => candidate), target);
      if (!env.yahooShoppingSearchAllRelevantStores && matchedCount >= target) break;
      sellerSearchRequestCountById[store.sellerId] = (sellerSearchRequestCountById[store.sellerId] ?? 0) + 1;
      try {
        const previousMatchedCount = matchedCount;
        const storeCandidates = await searchYahooShoppingStore(queries[0], store, args, seenCodes, seenUrls);
        for (const candidate of storeCandidates) entries.push({ candidate, queryIndex: -1, sequence: entries.length });
        const nextMatchedCount = countComparableMarketplaceSamples(args.profile, MARKETPLACE_IDS.yahooShopping, entries.map(({ candidate }) => candidate), target);
        incrementalPricingSamplesBySellerId[store.sellerId] = Math.max(0, nextMatchedCount - previousMatchedCount);
      } catch (caught) {
        if (args.signal?.aborted) throw args.signal.reason instanceof Error ? args.signal.reason : new Error("Yahoo! Shopping search canceled.");
        error ??= safeError(caught);
        if (stopsSearchAfterFailure(caught)) break;
      }
    }
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
    source: MARKETPLACE_IDS.yahooShopping,
    keyword: queriesUsed.join(" | "),
    searchUrl: YAHOO_SHOPPING_ITEM_SEARCH_ENDPOINT,
    error,
    candidates,
    diagnostics: [{ kind: "yahoo_search_metrics", sellerSearchRequestCountById, incrementalPricingSamplesBySellerId }],
  };
}

export const yahooShoppingProvider: HttpMarketplaceProvider = {
  source: MARKETPLACE_IDS.yahooShopping,
  runtime: "http",
  supportsProfile: () => env.yahooShoppingApiEnabled,
  search: searchYahooShopping,
};