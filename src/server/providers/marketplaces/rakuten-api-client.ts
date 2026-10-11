import "server-only";

import { env } from "../../config/env";

export const RAKUTEN_ITEM_SEARCH_ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
export const RAKUTEN_API_TIMEOUT_MS = 10_000;

export type RakutenApiItem = {
  itemName?: unknown;
  itemCode?: unknown;
  itemPrice?: unknown;
  itemUrl?: unknown;
  availability?: unknown;
  shopName?: unknown;
  shopCode?: unknown;
  itemCaption?: unknown;
  mediumImageUrls?: unknown;
  smallImageUrls?: unknown;
  genreId?: unknown;
};

export type RakutenApiResponse = {
  items: RakutenApiItem[];
};

export type RakutenApiErrorKind =
  | "configuration_error"
  | "invalid_query"
  | "auth_error"
  | "rate_limited"
  | "upstream_error"
  | "timeout"
  | "invalid_response";

export class RakutenApiError extends Error {
  constructor(readonly kind: RakutenApiErrorKind, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "RakutenApiError";
  }
}

type FetchRakutenItemsOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  rateLimit?: (signal?: AbortSignal) => Promise<void>;
};

let nextRequestAt = 0;
let rateLimitQueue: Promise<void> = Promise.resolve();

function extendRateLimit(seconds: number | undefined): void {
  if (seconds && seconds > 0) nextRequestAt = Math.max(nextRequestAt, Date.now() + seconds * 1000);
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : undefined;
}

async function waitForRateLimit(signal?: AbortSignal): Promise<void> {
  const previous = rateLimitQueue;
  let release!: () => void;
  rateLimitQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) {
      if (signal?.aborted) throw signal.reason;
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => signal?.removeEventListener("abort", abort);
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, waitMs);
        const abort = (): void => {
          clearTimeout(timer);
          cleanup();
          reject(signal?.reason ?? new Error("Request was aborted."));
        };
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

function validateEnvelope(value: unknown): RakutenApiResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new RakutenApiError("invalid_response", "Rakuten API returned an invalid response envelope.");
  }
  if (!value.items.every(isRecord)) {
    throw new RakutenApiError("invalid_response", "Rakuten API returned an invalid item list.");
  }
  return { items: value.items as RakutenApiItem[] };
}

export async function fetchRakutenItems(
  keyword: string,
  options: FetchRakutenItemsOptions = {},
): Promise<RakutenApiResponse> {
  const applicationId = env.rakutenApplicationId;
  const accessKey = env.rakutenAccessKey;
  if (!applicationId || !accessKey) {
    throw new RakutenApiError("configuration_error", "Rakuten Official API credentials are not configured.");
  }

  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword || new TextEncoder().encode(normalizedKeyword).length > 128) {
    throw new RakutenApiError("invalid_query", "Rakuten API keyword is empty or exceeds 128 UTF-8 bytes.");
  }

  const url = new URL(RAKUTEN_ITEM_SEARCH_ENDPOINT);
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("keyword", normalizedKeyword);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("availability", "1");

  const rateLimit = options.rateLimit ?? waitForRateLimit;
  await rateLimit(options.signal);
  const timeoutSignal = AbortSignal.timeout(RAKUTEN_API_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: { accessKey, Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error("Rakuten API request was canceled.");
    if (signal.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new RakutenApiError("timeout", "Rakuten API request timed out.");
    }
    throw new RakutenApiError("upstream_error", "Rakuten API request failed.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new RakutenApiError("auth_error", `Rakuten API authentication failed (${response.status}).`);
  }
  if (response.status === 429) {
    const retrySeconds = retryAfterSeconds(response.headers.get("Retry-After"));
    extendRateLimit(retrySeconds);
    throw new RakutenApiError("rate_limited", "Rakuten API rate limit was reached; no automatic retry was made.", retrySeconds);
  }
  if (!response.ok) {
    throw new RakutenApiError("upstream_error", `Rakuten API returned HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error("Rakuten API request was canceled.");
    if (signal.aborted) throw new RakutenApiError("timeout", "Rakuten API request timed out.");
    throw new RakutenApiError("invalid_response", "Rakuten API returned malformed JSON.");
  }
  return validateEnvelope(payload);
}

export function resetRakutenRateLimitForTests(): void {
  nextRequestAt = 0;
  rateLimitQueue = Promise.resolve();
}