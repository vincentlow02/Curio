import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { RakutenApiResponse } from "../src/server/providers/marketplaces/rakuten-api-client";
import { env } from "../src/server/config/env";
import { fetchRakutenItems, RakutenApiError } from "../src/server/providers/marketplaces/rakuten-api-client";

const SEARCH_PATH = "/internal/rakuten/search";
const MAX_BODY_BYTES = 4096;
const MIN_TOKEN_BYTES = 32;
const MIN_REQUEST_INTERVAL_MS = 1000;

export type RakutenGatewaySearch = (keyword: string, signal: AbortSignal) => Promise<RakutenApiResponse>;

export type RakutenGatewayOptions = {
  authToken?: string;
  search?: RakutenGatewaySearch;
  now?: () => number;
};

class GatewayRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenDigest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  const match = /^Bearer ([^\s]+)$/i.exec(header ?? "");
  const actualToken = match?.[1] ?? "";
  return timingSafeEqual(tokenDigest(actualToken), tokenDigest(expectedToken)) && Boolean(match);
}

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new GatewayRequestError(413, "request_too_large");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new GatewayRequestError(413, "request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function safeUpstreamError(error: unknown): { status: number; code: string; retryAfter?: string } {
  if (!(error instanceof RakutenApiError)) return { status: 502, code: "upstream_error" };
  if (error.kind === "configuration_error") return { status: 503, code: "gateway_configuration_error" };
  if (error.kind === "invalid_query") return { status: 400, code: "invalid_query" };
  if (error.kind === "rate_limited") {
    return { status: 429, code: "upstream_rate_limited", retryAfter: String(error.retryAfterSeconds ?? 1) };
  }
  if (error.kind === "timeout") return { status: 504, code: "upstream_timeout" };
  if (error.kind === "auth_error") return { status: 502, code: "upstream_auth_error" };
  return { status: 502, code: "upstream_error" };
}

export function createRakutenGatewayServer(options: RakutenGatewayOptions = {}): Server {
  const authToken = options.authToken ?? env.rakutenGatewayServerAuthToken;
  if (Buffer.byteLength(authToken) < MIN_TOKEN_BYTES) {
    throw new Error("Rakuten Gateway auth token must contain at least 32 bytes.");
  }

  const search = options.search ?? ((keyword, signal) => fetchRakutenItems(keyword, { signal }));
  const now = options.now ?? Date.now;
  let nextRequestAt = 0;
  let requestInFlight = false;

  const server = createServer((request, response) => {
    void (async () => {
      let controller: AbortController | null = null;
      let acquiredSlot = false;
      try {
        const requestUrl = new URL(request.url ?? "/", "http://gateway.invalid");
        if (requestUrl.origin !== "http://gateway.invalid" || requestUrl.pathname !== SEARCH_PATH
          || requestUrl.search || requestUrl.hash) {
          sendJson(response, 404, { error: "not_found" });
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "method_not_allowed" }, { Allow: "POST" });
          return;
        }
        if (!isAuthorized(request.headers.authorization, authToken)) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }

        const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
        if (contentType !== "application/json") {
          sendJson(response, 415, { error: "unsupported_media_type" });
          return;
        }

        let payload: unknown;
        try {
          payload = JSON.parse((await readRequestBody(request)).toString("utf8"));
        } catch (error) {
          if (error instanceof GatewayRequestError) throw error;
          throw new GatewayRequestError(400, "invalid_json");
        }
        if (!isRecord(payload) || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, "keyword")
          || typeof payload.keyword !== "string") {
          throw new GatewayRequestError(400, "invalid_request");
        }

        const keyword = payload.keyword.trim();
        if (!keyword || new TextEncoder().encode(keyword).length > 128) {
          throw new GatewayRequestError(400, "invalid_query");
        }

        const currentTime = now();
        if (requestInFlight || currentTime < nextRequestAt) {
          const retryAfter = Math.max(1, Math.ceil((nextRequestAt - currentTime) / 1000));
          sendJson(response, 429, { error: "gateway_rate_limited" }, { "Retry-After": String(retryAfter) });
          return;
        }
        requestInFlight = true;
        acquiredSlot = true;
        nextRequestAt = currentTime + MIN_REQUEST_INTERVAL_MS;

        controller = new AbortController();
        const abortIfDisconnected = (): void => {
          if (!response.writableEnded && !controller?.signal.aborted) {
            controller?.abort(new Error("Gateway caller disconnected."));
          }
        };
        request.once("aborted", abortIfDisconnected);
        response.once("close", abortIfDisconnected);

        const result = await search(keyword, controller.signal);
        sendJson(response, 200, { items: result.items });
      } catch (error) {
        if (controller?.signal.aborted || response.destroyed) return;
        if (error instanceof GatewayRequestError) {
          sendJson(response, error.status, { error: error.code });
          return;
        }
        const safeError = safeUpstreamError(error);
        sendJson(response, safeError.status, { error: safeError.code }, safeError.retryAfter
          ? { "Retry-After": safeError.retryAfter }
          : {});
      } finally {
        if (acquiredSlot) requestInFlight = false;
      }
    })().catch(() => {
      sendJson(response, 500, { error: "gateway_error" });
    });
  });

  server.headersTimeout = 5_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 32;
  return server;
}