import { isIP } from "node:net";

import { chromium, type BrowserContext, type Page } from "playwright";

import type { ItemProfile } from "../profile/types";
import { identityMatches } from "./identity";
import type { TavilyFallbackSnapshot } from "./types";

type TavilyResponse = {
  results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  usage?: Record<string, unknown>;
};

export function buildTavilyPriceQuery(profile: ItemProfile): string {
  const parts = [profile.itemName, profile.brandCharacterSeries, profile.versionOrPeriod, profile.priceSearchKeywordJa]
    .map((value) => value.trim())
    .filter((value) => value && value.toLowerCase() !== "unknown");
  return `${[...new Set(parts)].map((value) => value.replace(/"/g, "")).join(" ")} 価格`;
}

function safeResultUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) return null;
    if (isIP(url.hostname) && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function parsePrice(structured: number[], text: string): number | null {
  const validStructured = structured.find((price) => Number.isInteger(price) && price >= 100 && price <= 10_000_000);
  if (validStructured) return validStructured;
  const match = text.match(/(?:¥|￥)\s*([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,})|([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,})\s*円/);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  const price = Number(raw.replace(/,/g, ""));
  return Number.isInteger(price) && price >= 100 && price <= 10_000_000 ? price : null;
}

async function inspectPage(context: BrowserContext, url: string, profile: ItemProfile): Promise<{ title: string; text: string; price: number | null; identityMatched: boolean }> {
  const page: Page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const data = await page.evaluate(() => {
      const structuredPrices: number[] = [];
      for (const meta of [...document.querySelectorAll<HTMLMetaElement>("meta[property='product:price:amount'], meta[itemprop='price']")]) {
        const value = Number((meta.content || meta.getAttribute("content") || "").replace(/,/g, ""));
        if (Number.isFinite(value)) structuredPrices.push(value);
      }
      for (const script of [...document.querySelectorAll<HTMLScriptElement>("script[type='application/ld+json']")]) {
        for (const match of (script.textContent || "").matchAll(/"price"\s*:\s*"?([\d,]+(?:\.\d+)?)"?/g)) {
          const value = Number(match[1]!.replace(/,/g, ""));
          if (Number.isFinite(value)) structuredPrices.push(Math.round(value));
        }
      }
      return { title: document.title.trim(), text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 3000), structuredPrices };
    });
    const combined = `${data.title} ${data.text}`;
    return { title: data.title, text: data.text, price: parsePrice(data.structuredPrices, combined), identityMatched: identityMatches(profile, combined) };
  } finally {
    await page.close();
  }
}

export function disabledTavilyFallback(profile: ItemProfile): TavilyFallbackSnapshot {
  return { version: 1, provider: "Tavily", triggered: false, query: buildTavilyPriceQuery(profile), searchUrl: "https://api.tavily.com/search", capturedAt: new Date().toISOString(), searchError: null, results: [], candidates: [], usage: null };
}

export async function captureTavilyPriceFallback(args: { profile: ItemProfile; apiKey: string | undefined; maxResultsToOpen: number; headless: boolean }): Promise<TavilyFallbackSnapshot> {
  const query = buildTavilyPriceQuery(args.profile);
  const snapshot: TavilyFallbackSnapshot = { version: 1, provider: "Tavily", triggered: true, query, searchUrl: "https://api.tavily.com/search", capturedAt: new Date().toISOString(), searchError: null, results: [], candidates: [], usage: null };
  if (!args.apiKey) {
    snapshot.searchError = "TAVILY_API_KEY 未配置。";
    return snapshot;
  }
  let rawResults: Array<{ title: string; url: string }> = [];
  try {
    const response = await fetch(snapshot.searchUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", auto_parameters: false, max_results: 2, include_answer: false, include_raw_content: false, include_images: false, include_usage: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Tavily HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const payload = await response.json() as TavilyResponse;
    snapshot.usage = payload.usage ?? null;
    rawResults = (payload.results ?? []).flatMap((result) => {
      const url = result.url ? safeResultUrl(result.url) : null;
      return url ? [{ title: result.title?.trim() || url, url }] : [];
    }).slice(0, Math.min(args.maxResultsToOpen, 2));
    if (!rawResults.length) snapshot.searchError = "Tavily 没有返回可打开的 HTTPS 搜索结果。";
  } catch (error) {
    snapshot.searchError = error instanceof Error ? error.message : String(error);
    return snapshot;
  }

  const browser = await chromium.launch({ headless: args.headless });
  try {
    const context = await browser.newContext({ locale: "ja-JP" });
    for (const [index, result] of rawResults.entries()) {
      try {
        const inspected = await inspectPage(context, result.url, args.profile);
        snapshot.results.push({ rank: index + 1, title: inspected.title || result.title, url: result.url, opened: true, pageError: null, identityMatched: inspected.identityMatched, extractedPrice: inspected.price });
        if (inspected.identityMatched && inspected.price !== null) {
          snapshot.candidates.push({ source: "Web fallback", rank: index + 1, title: inspected.title || result.title, displayedPrice: inspected.price, url: result.url, shopName: new URL(result.url).hostname, availabilityText: inspected.text });
        }
      } catch (error) {
        snapshot.results.push({ rank: index + 1, title: result.title, url: result.url, opened: true, pageError: error instanceof Error ? error.message : String(error), identityMatched: false, extractedPrice: null });
      }
    }
    return snapshot;
  } finally {
    await browser.close();
  }
}
