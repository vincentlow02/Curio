import "server-only";

import { env } from "../../config/env";
import { createTimeoutSignal, fetchWithHttpMetrics } from "./shared/http";

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
  onRequest?: () => void;
  onHttpRequestStarted?: () => void;
  onHttpRequestCompleted?: (status: number | null, elapsedMs: number, blockingRelevant?: boolean) => void;
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

function invalidResponse(): RakutenApiError {
  return new RakutenApiError("invalid_response", "Rakuten API returned an invalid item response.");
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "string") throw invalidResponse();
  return value;
}

function validImageField(value: unknown): boolean {
  if (value === null || typeof value === "string") return true;
  if (!Array.isArray(value)) return false;
  return value.every((entry) => typeof entry === "string"
    || (isRecord(entry) && typeof entry.imageUrl === "string"));
}

function normalizeRakutenItem(value: unknown): RakutenApiItem {
  if (!isRecord(value)) throw invalidResponse();

  const hasLowerWrapper = Object.hasOwn(value, "item");
  const hasUpperWrapper = Object.hasOwn(value, "Item");
  if (hasLowerWrapper && hasUpperWrapper) throw invalidResponse();
  const itemValue = hasLowerWrapper ? value.item : hasUpperWrapper ? value.Item : value;
  if (!isRecord(itemValue)) throw invalidResponse();

  const itemName = optionalString(itemValue, "itemName");
  const itemUrl = optionalString(itemValue, "itemUrl");
  if (!itemName?.trim() || !itemUrl?.trim()) throw invalidResponse();

  const normalized: RakutenApiItem = { itemName, itemUrl };
  for (const key of ["itemCode", "shopName", "shopCode", "itemCaption"] as const) {
    const field = optionalString(itemValue, key);
    if (field !== undefined) normalized[key] = field;
  }

  if (Object.hasOwn(itemValue, "genreId")) {
    const genreId = itemValue.genreId;
    if (typeof genreId === "string") {
      normalized.genreId = genreId;
    } else if (typeof genreId === "number" && Number.isSafeInteger(genreId) && genreId >= 0) {
      normalized.genreId = String(genreId);
    } else {
      throw invalidResponse();
    }
  }

  if (Object.hasOwn(itemValue, "itemPrice")) {
    const price = itemValue.itemPrice;
    if (price !== null && typeof price !== "number" && typeof price !== "string") throw invalidResponse();
    normalized.itemPrice = price;
  }
  if (Object.hasOwn(itemValue, "availability")) {
    const availability = itemValue.availability;
    if (availability !== null && typeof availability !== "number") throw invalidResponse();
    normalized.availability = availability;
  }
  for (const key of ["mediumImageUrls", "smallImageUrls"] as const) {
    if (!Object.hasOwn(itemValue, key)) continue;
    const images = itemValue[key];
    if (!validImageField(images)) throw invalidResponse();
    normalized[key] = images;
  }

  return normalized;
}

function validateEnvelope(value: unknown): RakutenApiResponse {
  if (!isRecord(value)) throw invalidResponse();
  const hasLowerItems = Object.hasOwn(value, "items");
  const hasUpperItems = Object.hasOwn(value, "Items");
  if (hasLowerItems === hasUpperItems) throw invalidResponse();
  const rawItems = hasLowerItems ? value.items : value.Items;
  if (!Array.isArray(rawItems)) throw invalidResponse();
  return { items: rawItems.map(normalizeRakutenItem) };
}

export async function fetchRakutenItems(
  keyword: string,
  options: FetchRakutenItemsOptions = {},
): Promise<RakutenApiResponse> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword || new TextEncoder().encode(normalizedKeyword).length > 128) {
    throw new RakutenApiError("invalid_query", "Rakuten API keyword is empty or exceeds 128 UTF-8 bytes.");
  }

  const gatewayConfigured = Boolean(env.rakutenGatewayUrl || env.rakutenGatewayAuthToken);
  let requestUrl: URL;
  let requestInit: RequestInit;
  if (gatewayConfigured) {
    if (!env.rakutenGatewayUrl || !env.rakutenGatewayAuthToken) {
      throw new RakutenApiError("configuration_error", "Rakuten Gateway configuration is incomplete.");
    }

    let gatewayBase: URL;
    try {
      gatewayBase = new URL(env.rakutenGatewayUrl);
    } catch {
      throw new RakutenApiError("configuration_error", "Rakuten Gateway URL is invalid.");
    }
    if (gatewayBase.protocol !== "https:" || gatewayBase.username || gatewayBase.password
      || gatewayBase.pathname !== "/" || gatewayBase.search || gatewayBase.hash) {
      throw new RakutenApiError("configuration_error", "Rakuten Gateway URL must be an HTTPS origin without credentials or a path.");
    }

    requestUrl = new URL("/internal/rakuten/search", gatewayBase.origin);
    requestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.rakutenGatewayAuthToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keyword: normalizedKeyword }),
      redirect: "manual",
    };
  } else {
    const applicationId = env.rakutenApplicationId;
    const accessKey = env.rakutenAccessKey;
    if (!applicationId || !accessKey) {
      throw new RakutenApiError("configuration_error", "Rakuten Official API credentials are not configured.");
    }

    requestUrl = new URL(RAKUTEN_ITEM_SEARCH_ENDPOINT);
    requestUrl.searchParams.set("applicationId", applicationId);
    requestUrl.searchParams.set("keyword", normalizedKeyword);
    requestUrl.searchParams.set("format", "json");
    requestUrl.searchParams.set("formatVersion", "2");
    requestUrl.searchParams.set("hits", "30");
    requestUrl.searchParams.set("page", "1");
    requestUrl.searchParams.set("availability", "1");
    requestInit = {
      method: "GET",
      headers: { accessKey, Accept: "application/json" },
    };
  }

  const rateLimit = options.rateLimit ?? waitForRateLimit;
  await rateLimit(options.signal);
  const signal = createTimeoutSignal(options.signal, RAKUTEN_API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchWithHttpMetrics(options.fetchImpl ?? fetch, requestUrl, {
      ...requestInit,
      signal,
    }, {
      ...(options.onRequest ? { onRequest: options.onRequest } : {}),
      ...(options.onHttpRequestStarted ? { onHttpRequestStarted: options.onHttpRequestStarted } : {}),
      ...(options.onHttpRequestCompleted ? { onHttpRequestCompleted: options.onHttpRequestCompleted } : {}),
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