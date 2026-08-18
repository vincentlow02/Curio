import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ launch: vi.fn(), connectOverCDP: vi.fn() }));
vi.mock("playwright-core", () => ({ chromium: mocks }));

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  vi.clearAllMocks();
});

describe("browser provider", () => {
  it("never falls back to local Chromium on Vercel", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSER_PROVIDER = "local";
    const { createBrowserProvider } = await import("../src/server/browser/browser-provider");
    await expect(createBrowserProvider().open()).rejects.toThrow(/Local Chromium is disabled on Vercel/);
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it("uses one Browserless CDP connection and closes idempotently", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSER_PROVIDER = "browserless";
    process.env.BROWSERLESS_WS_ENDPOINT = "wss://production-sfo.browserless.io";
    process.env.BROWSERLESS_API_TOKEN = "test-token";
    const closeContext = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const browser = { newContext: vi.fn().mockResolvedValue({ close: closeContext }), close: closeBrowser };
    mocks.connectOverCDP.mockResolvedValue(browser);
    const { createBrowserProvider } = await import("../src/server/browser/browser-provider");
    const lease = await createBrowserProvider().open();
    expect(mocks.connectOverCDP).toHaveBeenCalledTimes(1);
    expect(String(mocks.connectOverCDP.mock.calls[0]?.[0])).toContain("token=test-token");
    expect(mocks.launch).not.toHaveBeenCalled();
    await lease.close();
    await lease.close();
    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });
});
