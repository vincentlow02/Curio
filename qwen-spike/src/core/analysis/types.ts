import type { DetectionResult } from "../profile/types";

export type AnalysisStage =
  | "queued"
  | "identifying"
  | "needs_review"
  | "searching_marketplaces"
  | "searching_fallback"
  | "processing_prices"
  | "completed"
  | "failed";

export type PublicPriceSample = {
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
export type CostSummary = {
  qwenCalls: number;
  inputTokens: number;
  outputTokens: number;
  marketplacePages: number;
  tavilyCalls: number;
  daytonaCalls: number;
  totalMs: number;
};

export type AnalysisResult = {
  identification: DetectionResult;
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
  createdAt: string;
  updatedAt: string;
  result: AnalysisResult | null;
  error: string | null;
};
