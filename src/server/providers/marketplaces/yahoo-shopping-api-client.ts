import "server-only";

import { env } from "../../config/env";
import { createTimeoutSignal, fetchWithHttpMetrics } from "./shared/http";

export const YAHOO_SHOPPING_ITEM_SEARCH_ENDPOINT = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";
export const YAHOO_SHOPPING_API_TIMEOUT_MS = 10_000;

export type YahooShoppingHit = {
  index?: unknown;
  name?: unknown;
  description?: unknown;
  headLine?: unknown;
  inStock?: unknown;
  url?: unknown;
  code?: unknown;
  condition?: unknown;
  price?: unknown;
  seller?: { name?: unknown; sellerId?: unknown };
};

export type YahooShoppingResponse = {
  totalResultsAvailable?: unknown;
  totalResultsReturned?: unknown;
  hits: YahooShoppingHit[];
};

export type YahooShoppingApiErrorKind =
  | "feature_disabled"
  | "configuration_error"
  | "invalid_query"
  | "rate_limited"
  | "upstream_error"
  | "timeout"
  | "invalid_response";

export class YahooShoppingApiError extends Error {
  constructor(readonly kind: YahooShoppingApiErrorKind, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "YahooShoppingApiError";
  }
}

export type YahooShoppingFetchOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onRequest?: () => void;
  onHttpRequestStarted?: () => void;
  onHttpRequestCompleted?: (status: number | null, elapsedMs: number, blockingRelevant?: boolean) => void;
  rateLimit?: (signal?: AbortSignal) => Promise<void>;
  sellerId?: string;
  seller_id?: string;
  condition?: string;
  inStock?: boolean;
  in_stock?: boolean;
  results?: number;
};

let nextRequestAt = 0;
let rateLimitQueue: Promise<void> = Promise.resolve();

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : undefined;
}

async function waitForYahooRateLimit(signal?: AbortSignal): Promise<void> {
  const previous = rateLimitQueue;
  let release!: () => void;
  rateLimitQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const delayMs = Math.max(0, nextRequestAt - Date.now());
    if (delayMs > 0) {
      if (signal?.aborted) throw signal.reason;
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => signal?.removeEventListener("abort", abort);
        const timer = setTimeout(() => { cleanup(); resolve(); }, delayMs);
        const abort = (): void => { clearTimeout(timer); cleanup(); reject(signal?.reason ?? new Error("Request aborted.")); };
        timer.unref?.();
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    if (signal?.aborted) throw signal.reason;
    nextRequestAt = Date.now() + 1000;
  } finally {
    release();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResponse(value: unknown): YahooShoppingResponse {
  if (!isRecord(value) || !Array.isArray(value.hits) || !value.hits.every(isRecord)) {
    throw new YahooShoppingApiError("invalid_response", "Yahoo! Shopping API returned an invalid response envelope.");
  }
  return {
    totalResultsAvailable: value.totalResultsAvailable,
    totalResultsReturned: value.totalResultsReturned,
    hits: value.hits as YahooShoppingHit[],
  };
}

export async function fetchYahooShoppingItems(query: string, options: YahooShoppingFetchOptions = {}): Promise<YahooShoppingResponse> {
  if (!env.yahooShoppingApiEnabled) {
    throw new YahooShoppingApiError("feature_disabled", "Yahoo! Shopping API Provider is disabled.");
  }
  const appId = env.yahooShoppingAppId;
  if (!appId) throw new YahooShoppingApiError("configuration_error", "Yahoo! Shopping Client ID is not configured.");
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new YahooShoppingApiError("invalid_query", "Yahoo! Shopping query is empty.");

  const url = new URL(YAHOO_SHOPPING_ITEM_SEARCH_ENDPOINT);
  const sellerId = (options.sellerId ?? options.seller_id ?? "").trim();
  const condition = (options.condition ?? "used").trim() || "used";
  const inStock = typeof options.inStock === "boolean" ? options.inStock : typeof options.in_stock === "boolean" ? options.in_stock : undefined;
  const results = Number.isInteger(options.results) && options.results! > 0 ? options.results! : 30;

  url.searchParams.set("appid", appId);
  url.searchParams.set("query", normalizedQuery);
  if (sellerId) url.searchParams.set("seller_id", sellerId);
  url.searchParams.set("condition", condition);
  if (typeof inStock === "boolean") url.searchParams.set("in_stock", String(inStock));
  url.searchParams.set("results", String(results));
  url.searchParams.set("sort", "-score");

  await (options.rateLimit ?? waitForYahooRateLimit)(options.signal);
  const signal = createTimeoutSignal(options.signal, YAHOO_SHOPPING_API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchWithHttpMetrics(options.fetchImpl ?? fetch, url, { method: "GET", headers: { Accept: "application/json" }, signal }, {
      ...(options.onRequest ? { onRequest: options.onRequest } : {}),
      ...(options.onHttpRequestStarted ? { onHttpRequestStarted: options.onHttpRequestStarted } : {}),
      ...(options.onHttpRequestCompleted ? { onHttpRequestCompleted: options.onHttpRequestCompleted } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error("Yahoo! Shopping request canceled.");
    if (signal.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new YahooShoppingApiError("timeout", "Yahoo! Shopping request timed out.");
    }
    throw new YahooShoppingApiError("upstream_error", "Yahoo! Shopping request failed.");
  }

  if (response.status === 429) {
    const retryAfter = retryAfterSeconds(response.headers.get("Retry-After"));
    if (retryAfter && retryAfter > 0) nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfter * 1000);
    throw new YahooShoppingApiError("rate_limited", "Yahoo! Shopping rate limit reached; no retry was made.", retryAfter);
  }
  if (!response.ok) throw new YahooShoppingApiError("upstream_error", `Yahoo! Shopping returned HTTP ${response.status}.`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error("Yahoo! Shopping request canceled.");
    if (signal.aborted) throw new YahooShoppingApiError("timeout", "Yahoo! Shopping request timed out.");
    throw new YahooShoppingApiError("invalid_response", "Yahoo! Shopping returned malformed JSON.");
  }
  return parseResponse(payload);
}

export function resetYahooShoppingRateLimitForTests(): void {
  nextRequestAt = 0;
  rateLimitQueue = Promise.resolve();
}