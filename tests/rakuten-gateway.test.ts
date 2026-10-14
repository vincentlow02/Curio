import { afterEach, describe, expect, it, vi } from "vitest";

import { RakutenApiError } from "../src/server/providers/marketplaces/rakuten-api-client";
import { createRakutenGatewayServer } from "../gateway/rakuten-gateway";

const TOKEN = "gateway-unit-test-secret-with-at-least-32-bytes";

async function withGateway(
  search: Parameters<typeof createRakutenGatewayServer>[0]["search"],
  run: (url: string) => Promise<void>,
  authToken: string | null = TOKEN,
): Promise<void> {
  const server = createRakutenGatewayServer({ ...(authToken === null ? {} : { authToken }), search });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test gateway did not bind a TCP port.");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

function request(url: string, body: unknown, token = TOKEN): Promise<Response> {
  return fetch(`${url}/internal/rakuten/search`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Rakuten VPS Gateway", () => {
  it("requires the service token before invoking the search client", async () => {
    const search = vi.fn(async () => ({ items: [] }));
    await withGateway(search, async (url) => {
      const response = await request(url, { keyword: "PSP-3000" }, "");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
      expect(search).not.toHaveBeenCalled();
    });
  });

  it("uses the VPS server token and keeps it separate from the Vercel client token", async () => {
    const previousServerToken = process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN;
    const previousClientToken = process.env.RAKUTEN_GATEWAY_AUTH_TOKEN;
    const clientToken = "vercel-client-test-token-that-is-different";
    process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN = TOKEN;
    process.env.RAKUTEN_GATEWAY_AUTH_TOKEN = clientToken;
    const search = vi.fn(async () => ({ items: [] }));

    try {
      await withGateway(search, async (url) => {
        const clientSideToken = await request(url, { keyword: "PSP-3000" }, clientToken);
        expect(clientSideToken.status).toBe(401);
        const serverToken = await request(url, { keyword: "PSP-3000" }, TOKEN);
        expect(serverToken.status).toBe(200);
        expect(search).toHaveBeenCalledOnce();
      }, null);
    } finally {
      if (previousServerToken === undefined) delete process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN;
      else process.env.RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN = previousServerToken;
      if (previousClientToken === undefined) delete process.env.RAKUTEN_GATEWAY_AUTH_TOKEN;
      else process.env.RAKUTEN_GATEWAY_AUTH_TOKEN = previousClientToken;
    }
  });

  it("accepts only a keyword and never acts as an arbitrary URL proxy", async () => {
    const search = vi.fn(async () => ({ items: [] }));
    await withGateway(search, async (url) => {
      const response = await request(url, { keyword: "PSP-3000", url: "https://example.invalid" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
      expect(search).not.toHaveBeenCalled();
    });
  });

  it("validates keyword size and route before calling the upstream client", async () => {
    const search = vi.fn(async () => ({ items: [] }));
    await withGateway(search, async (url) => {
      const invalidKeyword = await request(url, { keyword: "" });
      expect(invalidKeyword.status).toBe(400);
      const unknownRoute = await fetch(`${url}/proxy?url=https://example.invalid`);
      expect(unknownRoute.status).toBe(404);
      expect(search).not.toHaveBeenCalled();
    });
  });

  it("serializes upstream searches to at most one request per second", async () => {
    const search = vi.fn(async () => ({ items: [] }));
    await withGateway(search, async (url) => {
      const first = await request(url, { keyword: "PSP-3000" });
      const second = await request(url, { keyword: "PSP-2000" });
      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(second.headers.get("retry-after")).toBeTruthy();
      expect(search).toHaveBeenCalledOnce();
    });
  });

  it("returns a sanitized timeout response without forwarding internal details", async () => {
    const search = vi.fn(async () => {
      throw new RakutenApiError("timeout", "private upstream detail must not escape");
    });
    await withGateway(search, async (url) => {
      const response = await request(url, { keyword: "PSP-3000" });
      const body = await response.text();
      expect(response.status).toBe(504);
      expect(body).toBe('{"error":"upstream_timeout"}');
      expect(body).not.toContain("private upstream detail");
      expect(body).not.toContain(TOKEN);
    });
  });

  it("propagates caller disconnect cancellation to the upstream client", async () => {
    let markStarted!: () => void;
    let markAborted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const aborted = new Promise<void>((resolve) => { markAborted = resolve; });
    const search = vi.fn((_keyword: string, signal: AbortSignal) => new Promise<{ items: [] }>((_resolve, reject) => {
      markStarted();
      signal.addEventListener("abort", () => {
        markAborted();
        reject(signal.reason);
      }, { once: true });
    }));

    await withGateway(search, async (url) => {
      const controller = new AbortController();
      const pending = fetch(`${url}/internal/rakuten/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: "PSP-3000" }),
        signal: controller.signal,
      });
      await started;
      controller.abort();
      await expect(pending).rejects.toThrow();
      await aborted;
      expect(search).toHaveBeenCalledOnce();
    });
  });
});