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
    let now = 1000;
    let monotonic = 1000;
    const { createBrowserProvider } = await import("../src/server/browser/browser-provider");
    const lease = await createBrowserProvider({ now: () => now, monotonicNow: () => monotonic, createSessionId: () => "session-test" }).open();
    expect(mocks.connectOverCDP).toHaveBeenCalledTimes(1);
    expect(String(mocks.connectOverCDP.mock.calls[0]?.[0])).toContain("token=test-token");
    expect(mocks.launch).not.toHaveBeenCalled();
    now += 31_000;
    monotonic += 31_000;
    await lease.close();
    await lease.close();
    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
    expect(lease.session).toMatchObject({ sessionId: "session-test", transport: "browserless", durationMs: 31_000, estimatedTimeUnits: 2, proxyCaptchaUnits: null, actualUnits: null, actualCostUSD: null });
  });

  it("connects to a generic CDP endpoint without a token", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSER_PROVIDER = "browserless";
    process.env.BROWSERLESS_WS_ENDPOINT = "http://127.0.0.1:9222";
    delete process.env.BROWSERLESS_API_TOKEN;
    const closeContext = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const browser = { newContext: vi.fn().mockResolvedValue({ close: closeContext }), close: closeBrowser };
    mocks.connectOverCDP.mockResolvedValue(browser);
    const { createBrowserProvider } = await import("../src/server/browser/browser-provider");
    const { liveReadiness } = await import("../src/server/config/env");

    const lease = await createBrowserProvider().open();

    expect(mocks.connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9222/", { timeout: 10_000 });
    expect(lease.session.transport).toBe("browserless");
    expect(liveReadiness().browser).toBe(true);
    await lease.close();
    expect(closeContext).toHaveBeenCalledOnce();
    expect(closeBrowser).toHaveBeenCalledOnce();
  });

  it("closes the Browser connection if creating its context fails", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSER_PROVIDER = "browserless";
    process.env.BROWSERLESS_WS_ENDPOINT = "wss://production-sfo.browserless.io";
    process.env.BROWSERLESS_API_TOKEN = "test-token";
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    let now = 1000;
    let monotonic = 1000;
    const browser = { newContext: vi.fn().mockImplementation(() => { now += 32_000; monotonic += 32_000; throw new Error("Context creation failed"); }), close: closeBrowser };
    mocks.connectOverCDP.mockResolvedValue(browser);
    const { createBrowserProvider } = await import("../src/server/browser/browser-provider");
    const onSessionClosed = vi.fn();

    await expect(createBrowserProvider({ now: () => now, monotonicNow: () => monotonic, createSessionId: () => "failed-context-session" }).open({ onSessionClosed })).rejects.toThrow("Context creation failed");

    expect(closeBrowser).toHaveBeenCalledOnce();
    expect(onSessionClosed).toHaveBeenCalledOnce();
    expect(onSessionClosed.mock.calls[0]?.[0]).toMatchObject({ sessionId: "failed-context-session", durationMs: 32_000, estimatedTimeUnits: 2 });
  });
});
