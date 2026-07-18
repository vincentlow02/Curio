export type UploadState = "empty" | "dragging" | "preview" | "invalid_type" | "too_large" | "submitting" | "queue_full" | "api_error";

export type FixtureState =
  | "queued" | "identifying" | "searching_marketplaces" | "searching_auctions" | "searching_fallback" | "processing_prices"
  | "success" | "insufficient_price" | "partial_failure" | "needs_review" | "failed" | "expired";
