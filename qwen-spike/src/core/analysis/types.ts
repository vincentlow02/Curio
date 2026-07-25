import type { DetectionResult } from "../profile/types";

export type AnalysisStage =
  | "queued"
  | "identifying"
  | "identified"
  | "queued_research"
  | "needs_review"
  | "searching_marketplaces"
  | "searching_auctions"
  | "searching_fallback"
  | "processing_prices"
  | "completed"
  | "failed";

export type ToolActivity = {
  provider: "Qwen" | "Rakuten" | "Mercari" | "Yahoo Auctions" | "Mandarake Auction" | "Tavily" | "Node" | "Daytona";
  status: "pending" | "running" | "succeeded" | "failed" | "skipped" | "fallback";
  calls: number;
  durationMs: number | null;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  resultCount?: number;
  validResultCount?: number;
  fallbackUsed?: boolean;
  verificationStatus?: "not_run" | "verified" | "mismatch" | "unavailable";
  cacheHit?: boolean;
};

type PublicPriceSample = {
  title: string;
  price: number;
  currency: "JPY";
  source: "Rakuten" | "Mercari" | "Web fallback";
  url: string;
  condition: "used" | "new" | "unknown";
  versionMatch: "exact" | "similar";
  packageStatus: "with_box" | "without_box" | "unknown";
  includedInReferenceRange: boolean;
};

export type AreaRecommendation = { area: string; reason: string; searchKeywordJa: string };
export type StoreSuggestion = { name: string; reason: string; sourceUrl: string };
type CostSummary = {
  qwenCalls: number;
  inputTokens: number;
  outputTokens: number;
  marketplacePages: number;
  auctionPages: number;
  tavilyCalls: number;
  daytonaCalls: number;
  totalMs: number;
};

export type CollectorEvidence = {
  editionSignals: string[];
  conditionSignals: string[];
  visibleIdentifiers: string[];
  missingEvidence: string[];
};

export type AuctionSource = "Yahoo Auctions" | "Mandarake Auction";
export type AuctionSignal = {
  source: AuctionSource;
  title: string;
  currentPrice: number | null;
  startingPrice: number | null;
  buyNowPrice: number | null;
  bidCount: number | null;
  remainingTime: string;
  conditionText: string;
  matchedEvidence: string[];
  unresolvedDifferences: string[];
  url: string;
};

export type AuctionSourceSummary = {
  source: AuctionSource;
  status: "succeeded" | "no_results" | "failed" | "skipped";
  candidatesSeen: number;
  comparableSignals: number;
  signals: AuctionSignal[];
};

export type AnalysisResult = {
  identification: DetectionResult;
  collectorMode: boolean;
  collectorEvidence: CollectorEvidence | null;
  auctionSources: AuctionSourceSummary[];
  priceReference: {
    currency: "JPY";
    low: number | null;
    median: number | null;
    high: number | null;
    sampleCount: number;
    samples: PublicPriceSample[];
    disclaimer: "Online asking-price reference";
  };
  recommendedAreas: AreaRecommendation[];
  storeSuggestions: StoreSuggestion[];
  warnings: string[];
  cost: CostSummary;
};

export type AnalysisSessionView = {
  id: string;
  status: AnalysisStage;
  queuePosition: number | null;
  progress: number;
  message: string;
  identification: DetectionResult | null;
  collectorMode: boolean;
  collectorEvidence: CollectorEvidence | null;
  toolActivity: ToolActivity[];
  createdAt: string;
  updatedAt: string;
  result: AnalysisResult | null;
  error: string | null;
};
