import "server-only";

import { chromium, type Browser, type BrowserContext } from "playwright-core";

import { env } from "../config/env";

export type BrowserLease = {
  browser: Browser;
  context: BrowserContext;
  close(): Promise<void>;
};

export type BrowserProvider = {
  open(options?: { locale?: string }): Promise<BrowserLease>;
};

function browserlessUrl(endpoint: string, token: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : url.protocol;
  url.searchParams.set("token", token);
  return url.toString();
}

async function lease(browser: Browser, context: BrowserContext, timeoutMs: number): Promise<BrowserLease> {
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  };
  const timer = setTimeout(() => { void close(); }, timeoutMs);
  timer.unref?.();
  return { browser, context, close };
}

export function createBrowserProvider(): BrowserProvider {
  return {
    async open(options = {}): Promise<BrowserLease> {
      const locale = options.locale ?? "ja-JP";
      const timeoutMs = env.browserSessionTimeoutSeconds * 1000;
      if (env.browserProvider === "browserless") {
        if (!env.browserlessWsEndpoint || !env.browserlessApiToken) {
          throw new Error("Browserless is not configured for the production browser provider.");
        }
        const browser = await chromium.connectOverCDP(browserlessUrl(env.browserlessWsEndpoint, env.browserlessApiToken), { timeout: 10_000 });
        const context = await browser.newContext({ locale });
        return lease(browser, context, timeoutMs);
      }
      if (process.env.VERCEL === "1") {
        throw new Error("Local Chromium is disabled on Vercel. Configure Browserless instead.");
      }
      const browser = await chromium.launch({ headless: env.headless });
      const context = await browser.newContext({ locale });
      return lease(browser, context, timeoutMs);
    },
  };
}

export const browserProvider = createBrowserProvider();
