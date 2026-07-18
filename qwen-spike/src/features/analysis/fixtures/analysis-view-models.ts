import type { AnalysisSessionView } from "../../../core/analysis/types";
import { fixtureResult } from "../../../server/analysis/fixture-result";
import type { FixtureState } from "../types";

const now = new Date(0).toISOString();
const stages: Record<FixtureState, Partial<AnalysisSessionView>> = {
  queued: { status: "queued", progress: 4, message: "Waiting for the previous analysis to finish", queuePosition: 2 },
  identifying: { status: "identifying", progress: 18, message: "Identifying the collectible" },
  searching_marketplaces: { status: "searching_marketplaces", progress: 42, message: "Searching Rakuten and Mercari asking-price listings" },
  searching_auctions: { status: "searching_auctions", progress: 58, message: "Searching Yahoo! Auctions and Mandarake Auction" },
  searching_fallback: { status: "searching_fallback", progress: 60, message: "Running one controlled fallback search" },
  processing_prices: { status: "processing_prices", progress: 82, message: "Deduplicating samples and calculating the price range" },
  success: { status: "completed", progress: 100, message: "Analysis complete", result: fixtureResult() },
  insufficient_price: { status: "completed", progress: 100, message: "Identification complete, but price samples are insufficient", result: { ...fixtureResult(), priceReference: { ...fixtureResult().priceReference, low: null, median: null, high: null, sampleCount: 0, samples: [] }, warnings: ["There were not enough comparable asking-price samples."] } },
  partial_failure: { status: "completed", progress: 100, message: "Analysis complete with a partial source failure", result: { ...fixtureResult(), warnings: ["Mercari could not be read. The current range uses Rakuten only."] } },
  needs_review: { status: "needs_review", progress: 100, message: "The image needs another review", error: "The collectible category could not be identified reliably. Try a clearer image." },
  failed: { status: "failed", progress: 100, message: "Analysis failed", error: "The analysis service is temporarily unavailable. Please try again." },
  expired: { status: "failed", progress: 100, message: "Session expired", error: "The analysis session does not exist or has expired." },
};

export function fixtureSession(state: FixtureState): AnalysisSessionView {
  return { id: `fixture-${state}`, status: "queued", queuePosition: null, progress: 0, message: "", identification: null, collectorMode: false, collectorEvidence: null, toolActivity: [], createdAt: now, updatedAt: now, result: null, error: null, ...stages[state] };
}
