import type { StoreSnapshot } from "./types";
import { browserProvider } from "../server/browser/browser-provider";

export function buildStoreSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

export async function captureVerifiedStores(args: {
  query: string;
  maxStores: number;
  headless?: boolean;
}): Promise<StoreSnapshot> {
  const searchUrl = buildStoreSearchUrl(args.query);
  const lease = await browserProvider.open({ locale: "ja-JP" });
  try {
    const page = await lease.context.newPage();
    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForSelector("a[href*='/maps/place/']", { timeout: 10_000 });
      const stores = await page.evaluate((limit) => {
        const output: Array<{ name: string; sourceUrl: string }> = [];
        const seen = new Set<string>();
        for (const anchor of [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/maps/place/']")]) {
          const sourceUrl = anchor.href;
          const name = (anchor.getAttribute("aria-label") || anchor.getAttribute("title") || anchor.textContent || "").replace(/\s+/g, " ").trim();
          if (!name || name.length > 120 || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          output.push({ name, sourceUrl });
          if (output.length >= limit) break;
        }
        return output;
      }, args.maxStores);
      return { version: 1, enabled: true, query: args.query, searchUrl, capturedAt: new Date().toISOString(), error: null, stores };
    } catch (error) {
      return { version: 1, enabled: true, query: args.query, searchUrl, capturedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error), stores: [] };
    }
  } finally {
    await lease.close();
  }
}

export function disabledStoreSnapshot(): StoreSnapshot {
  return { version: 1, enabled: false, query: "", searchUrl: "", capturedAt: new Date().toISOString(), error: null, stores: [] };
}
