import "server-only";

import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext } from "playwright-core";

import { finishBrowserSessionUsage, type BrowserSessionUsage } from "./session-meter";
import { env } from "../config/env";

export type BrowserLease = {
  browser: Browser;
  context: BrowserContext;
  session: BrowserSessionUsage;
  close(): Promise<void>;
};

export type BrowserProvider = {
  open(options?: { locale?: string; onSessionClosed?: (session: BrowserSessionUsage) => void }): Promise<BrowserLease>;
};

function browserlessUrl(endpoint: string, token?: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : url.protocol;
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function notifySessionClosed(session: BrowserSessionUsage, callback?: (session: BrowserSessionUsage) => void): void {
  try { callback?.(session); } catch { /* Metrics callbacks must not prevent browser cleanup. */ }
}

async function lease(browser: Browser, context: BrowserContext, timeoutMs: number, session: BrowserSessionUsage, now: () => number, monotonicNow: () => number, startedAtMonotonic: number, onSessionClosed?: (session: BrowserSessionUsage) => void): Promise<BrowserLease> {
  let closePromise: Promise<void> | null = null;
  const close = async (): Promise<void> => {
    if (!closePromise) {
      closePromise = (async () => {
        clearTimeout(timer);
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
        finishBrowserSessionUsage(session, now(), monotonicNow() - startedAtMonotonic);
        notifySessionClosed(session, onSessionClosed);
      })();
    }
    await closePromise;
  };
  const timer = setTimeout(() => { void close(); }, timeoutMs);
  timer.unref?.();
  return { browser, context, session, close };
}

async function openLease(browser: Browser, locale: string, timeoutMs: number, session: BrowserSessionUsage, now: () => number, monotonicNow: () => number, startedAtMonotonic: number, onSessionClosed?: (session: BrowserSessionUsage) => void): Promise<BrowserLease> {
  try {
    const context = await browser.newContext({ locale });
    return lease(browser, context, timeoutMs, session, now, monotonicNow, startedAtMonotonic, onSessionClosed);
  } catch (error) {
    await browser.close().catch(() => undefined);
    finishBrowserSessionUsage(session, now(), monotonicNow() - startedAtMonotonic);
    notifySessionClosed(session, onSessionClosed);
    throw error;
  }
}

export function createBrowserProvider(options: { now?: () => number; monotonicNow?: () => number; createSessionId?: () => string } = {}): BrowserProvider {
  const now = options.now ?? Date.now;
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const createSessionId = options.createSessionId ?? randomUUID;
  return {
    async open(options = {}): Promise<BrowserLease> {
      const locale = options.locale ?? "ja-JP";
      const timeoutMs = env.browserSessionTimeoutSeconds * 1000;
      if (env.browserProvider === "browserless") {
        if (!env.browserlessWsEndpoint) {
          throw new Error("The remote CDP endpoint is not configured for the browser provider.");
        }
        const startedAt = now();
        const startedAtMonotonic = monotonicNow();
        const session: BrowserSessionUsage = { sessionId: createSessionId(), transport: "browserless", startedAt: new Date(startedAt).toISOString(), endedAt: null, durationMs: null, estimatedTimeUnits: null, proxyCaptchaUnits: null, actualUnits: null, actualCostUSD: null };
        const browser = await chromium.connectOverCDP(browserlessUrl(env.browserlessWsEndpoint, env.browserlessApiToken || undefined), { timeout: 10_000 });
        return openLease(browser, locale, timeoutMs, session, now, monotonicNow, startedAtMonotonic, options.onSessionClosed);
      }
      if (process.env.VERCEL === "1") {
        throw new Error("Local Chromium is disabled on Vercel. Configure Browserless instead.");
      }
      const startedAt = now();
      const startedAtMonotonic = monotonicNow();
      const session: BrowserSessionUsage = { sessionId: createSessionId(), transport: "local", startedAt: new Date(startedAt).toISOString(), endedAt: null, durationMs: null, estimatedTimeUnits: null, proxyCaptchaUnits: null, actualUnits: null, actualCostUSD: null };
      const browser = await chromium.launch({ headless: env.headless });
      return openLease(browser, locale, timeoutMs, session, now, monotonicNow, startedAtMonotonic, options.onSessionClosed);
    },
  };
}

export const browserProvider = createBrowserProvider();
