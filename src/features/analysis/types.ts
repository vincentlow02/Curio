export type FixtureState =
  | "queued" | "identifying" | "searching_marketplaces" | "searching_auctions" | "searching_fallback" | "processing_prices"
  | "success" | "insufficient_price" | "partial_failure" | "needs_review" | "failed" | "expired";
