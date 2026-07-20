export type RunMode = "fixture" | "live" | "replay";
export type MarketplaceSource = "Rakuten" | "Mercari";
export type PriceSource = MarketplaceSource | "Web fallback";

export type RakutenListingCandidate = {
  source: PriceSource;
  rank: number;
  title: string;
  displayedPrice: number | null;
  url: string;
  shopName: string;
  availabilityText: string;
};

export type TavilyFallbackSnapshot = {
  version: 1;
  provider: "Tavily";
  triggered: boolean;
  query: string;
  searchUrl: string;
  capturedAt: string;
  searchError: string | null;
  results: Array<{
    rank: number;
    title: string;
    url: string;
    opened: boolean;
    pageError: string | null;
    identityMatched: boolean;
    extractedPrice: number | null;
  }>;
  candidates: RakutenListingCandidate[];
  usage: Record<string, unknown> | null;
};

export type SearchSnapshot = {
  version: 2;
  capturedAt: string;
  sources: Array<{
    source: MarketplaceSource;
    keyword: string;
    searchUrl: string;
    error: string | null;
    candidates: RakutenListingCandidate[];
  }>;
};

export type ExclusionReason =
  | "missing_price"
  | "sold_out"
  | "junk_or_broken"
  | "new_item"
  | "incomplete_item"
  | "accessory_or_software_only"
  | "different_model"
  | "bundle_or_lot"
  | "duplicate"
  | "sample_limit";

export type PriceSample = {
  rank: number;
  title: string;
  price: number;
  currency: "JPY";
  source: PriceSource;
  url: string;
  shopName: string;
  listingStatus: "active" | "unknown";
  condition: "used" | "new" | "unknown";
  versionMatch: "exact" | "similar";
  packageStatus: "with_box" | "without_box" | "unknown";
  includedInReferenceRange: boolean;
  aggregationExclusionReason: "price_outlier" | "new_condition" | "unknown_condition" | null;
};

export type StoreSnapshot = {
  version: 1;
  enabled: boolean;
  query: string;
  searchUrl: string;
  capturedAt: string;
  error: string | null;
  stores: Array<{ name: string; sourceUrl: string }>;
};

export type AreaRecommendationResult = {
  area: string;
  reason: string;
  storeSearchKeywordJa: string;
  storeSearchUrl: string;
  verifiedStores: Array<{ name: string; sourceUrl: string; verificationStatus: "maps_search_result" }>;
};

export type NumericRange = { low: number | null; median: number | null; high: number | null; sampleCount: number };

export type PriceReferenceResult = {
  query: {
    itemName: string;
    versionOrPeriod: string;
    priceSearchKeywordJa: string;
    sources: Array<{ source: PriceSource; keyword: string; searchUrl: string }>;
  };
  recommendedAreas: AreaRecommendationResult[];
  storeRecommendationDisclaimer: string;
  samples: PriceSample[];
  observedRange: {
    currency: "JPY";
    min: number | null;
    max: number | null;
    sampleCount: number;
  };
  referenceRange: NumericRange & {
    currency: "JPY";
    label: "Online asking-price reference";
    method: "median_absolute_deviation";
  };
  referenceRangeBySource: Array<{ source: PriceSource } & NumericRange>;
  conditionRanges: Array<{ condition: "used" | "new" | "unknown" } & NumericRange>;
  warnings: string[];
};

export type PriceTrace = {
  runId: string;
  mode: RunMode;
  sourceRunId: string | null;
  priceSearchKeywordJa: string;
  sourceSearches: Array<{ source: PriceSource; keyword: string; searchUrl: string; error: string | null; candidatesScanned: number }>;
  included: Array<{ source: PriceSource; rank: number; url: string }>;
  excluded: Array<{ source: PriceSource; rank: number; url: string; reason: ExclusionReason }>;
  aggregation: Array<{ source: PriceSource; rank: number; url: string; included: boolean; reason: PriceSample["aggregationExclusionReason"] }>;
  limits: { maxCardsScannedPerSource: number; maxSamplesPerSource: number; maxTotalSamples: number; maxDetailPages: number };
  cache: { priceHit: boolean; storeHit: boolean; tavilyFallbackHit: boolean; refresh: boolean; priceKey: string; storeKey: string | null; tavilyFallbackKey: string | null };
  errors: string[];
  warnings: string[];
  daytona: {
    enabled: boolean;
    attempted: boolean;
    succeeded: boolean;
    fallbackUsed: boolean;
    verificationStatus: "not_run" | "verified" | "mismatch" | "unavailable";
    nodeResultRetained: true;
    sandboxId: string | null;
    remoteStatePath: string | null;
    error: string | null;
    durationMs: number;
  };
  tavilyFallback: {
    triggered: boolean;
    query: string;
    searchUrl: string;
    searchError: string | null;
    resultsOpened: number;
    validPrices: number;
  };
  startedAt: string;
  completedAt: string;
};

export type PriceCost = {
  mode: RunMode;
  browserSearchPagesOpened: number;
  storeSearchPagesOpened: number;
  detailPagesOpened: number;
  qwenCalls: number;
  inputTokens: number;
  outputTokens: number;
  daytonaCalls: number;
  daytonaSandboxesCreated: number;
  daytonaDurationMs: number;
  tavilySearchCalls: number;
  tavilyCredits: number;
  fallbackDetailPagesOpened: number;
  priceCacheHit: boolean;
  storeCacheHit: boolean;
  startedAt: string;
  completedAt: string;
  totalMs: number;
};
