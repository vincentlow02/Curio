import { chromium, type Page } from "playwright";
import type { AuctionSignal, AuctionSource, AuctionSourceSummary, CollectorEvidence } from "../../../core/analysis/types";
import type { DetectionResult } from "../../../core/profile/types";
import { toLegacyItemProfile } from "../../../core/profile/legacy-adapter";
import { identityMatches, normalizeIdentity } from "../../../price/identity";

const LIMITS: Record<AuctionSource, number> = { "Yahoo Auctions": 5, "Mandarake Auction": 3 };

export type RawAuctionCard = { title: string; text: string; url: string };

export function buildAuctionKeyword(identification: DetectionResult): string {
  const cleaned = identification.priceSearchKeywordJa
    .replace(/(?:中古|価格|店舗|専門店)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || `${identification.itemName} ${identification.version === "unknown" ? "" : identification.version}`.trim();
}

export function buildYahooAuctionUrl(keyword: string): string {
  return `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(keyword)}`;
}

export function buildMandarakeAuctionUrl(keyword: string): string {
  return `https://ekizo.mandarake.co.jp/auction/item/itemsListEn.html?keywords=1&t=0&q=${encodeURIComponent(keyword)}`;
}

function yen(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const match = text.match(label);
    if (match?.[1]) return Number(match[1].replace(/,/g, ""));
  }
  return null;
}

function count(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const match = text.match(label);
    if (match?.[1]) return Number(match[1].replace(/,/g, ""));
  }
  return null;
}

function condition(text: string): string {
  const match = text.match(/(?:状態|Condition)\s*[:：]?\s*([^\n|]{1,80})/i);
  return match?.[1]?.trim() ?? "unknown";
}

function remaining(text: string): string {
  const match = text.match(/(?:残り|Time Left)\s*[:：]?\s*([^\n|]{1,40})/i);
  return match?.[1]?.trim() ?? "unknown";
}

function evidenceFor(title: string, identification: DetectionResult, evidence: CollectorEvidence | null): { matched: string[]; unresolved: string[] } {
  const normalized = normalizeIdentity(title);
  const candidates = [identification.version, ...(evidence?.editionSignals ?? []), ...(evidence?.visibleIdentifiers ?? [])]
    .filter((value) => value && !/^unknown$/i.test(value));
  const matched = candidates.filter((value) => normalized.includes(normalizeIdentity(value))).slice(0, 6);
  const unresolved = candidates.filter((value) => !normalized.includes(normalizeIdentity(value))).slice(0, 6);
  if (!evidence?.conditionSignals.length) unresolved.push("Condition cannot be compared from the available evidence");
  return { matched: [...new Set(matched)], unresolved: [...new Set(unresolved)] };
}

export function parseAuctionCard(source: AuctionSource, raw: RawAuctionCard, identification: DetectionResult, evidence: CollectorEvidence | null): AuctionSignal {
  const details = evidenceFor(raw.title, identification, evidence);
  const currentPrice = source === "Yahoo Auctions"
    ? yen(raw.text, [/(?:現在価格|Current Price)\s*[:：]?\s*(?:¥|￥)?\s*([\d,]+)\s*円?/i, /(?:¥|￥)\s*([\d,]+)/])
    : yen(raw.text, [/(?:Current Price)\s*[:：]?\s*(?:¥|￥)?\s*([\d,]+)\s*(?:Yen|円)?/i, /(?:¥|￥)?\s*([\d,]+)\s*Yen/i]);
  return {
    source,
    title: raw.title,
    currentPrice,
    startingPrice: yen(raw.text, [/(?:開始価格|Start(?:ing)? Price)\s*[:：]?\s*(?:¥|￥)?\s*([\d,]+)\s*(?:Yen|円)?/i]),
    buyNowPrice: source === "Yahoo Auctions" ? yen(raw.text, [/(?:即決価格|Buy Now)\s*[:：]?\s*(?:¥|￥)?\s*([\d,]+)\s*円?/i]) : null,
    bidCount: count(raw.text, [/(?:入札|(?:No\.\s*of\s*)?Bids?)\s*[:：]?\s*([\d,]+)/i, /([\d,]+)\s*(?:件|bids?)/i]),
    remainingTime: remaining(raw.text),
    conditionText: condition(raw.text),
    matchedEvidence: details.matched,
    unresolvedDifferences: details.unresolved,
    url: raw.url,
  };
}

async function cardsFromPage(page: Page, source: AuctionSource): Promise<RawAuctionCard[]> {
  const expectedHost = source === "Yahoo Auctions" ? "auctions.yahoo.co.jp" : "ekizo.mandarake.co.jp";
  return page.locator("a[href]").evaluateAll((anchors, args) => {
    const { expectedHost, source } = args as { expectedHost: string; source: AuctionSource };
    const seen = new Set<string>();
    const cards: RawAuctionCard[] = [];
    for (const anchor of anchors as HTMLAnchorElement[]) {
      let url: URL;
      try { url = new URL(anchor.href); } catch { continue; }
      const validHost = source === "Yahoo Auctions" ? (url.hostname === expectedHost || url.hostname.endsWith(`.${expectedHost}`)) : url.hostname === expectedHost;
      if (!validHost || seen.has(url.href)) continue;
      const validPath = source === "Yahoo Auctions" ? /\/jp\/auction\//.test(url.pathname) : /\/auction\/item\//.test(url.pathname) && !/itemsList/i.test(url.pathname);
      if (!validPath) continue;
      let node: HTMLElement | null = anchor;
      let text = (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim();
      for (let depth = 0; depth < 6 && node?.parentElement; depth += 1) {
        node = node.parentElement;
        const candidate = (node.innerText || "").replace(/\s+/g, " ").trim();
        if (candidate.length >= text.length && candidate.length <= 1800 && /(?:¥|￥|円|Yen|Current Price)/i.test(candidate)) text = candidate;
      }
      let title = (anchor.getAttribute("title") || anchor.querySelector("img")?.getAttribute("alt") || anchor.textContent || "").replace(/\s+/g, " ").trim();
      if (/^(?:Details|Watch|Bid|Item's picture)$/i.test(title)) title = text.match(/\b\d{12,}\s+(.+?)\s+Details\b/i)?.[1]?.trim() ?? text.slice(0, 240);
      if (title.length < 3 || !/(?:¥|￥|円|Yen|Current Price)/i.test(text)) continue;
      seen.add(url.href);
      cards.push({ title, text, url: url.href });
      if (cards.length >= 20) break;
    }
    return cards;
  }, { expectedHost, source });
}

async function captureSource(page: Page, source: AuctionSource, url: string, identification: DetectionResult, evidence: CollectorEvidence | null): Promise<AuctionSourceSummary> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const raw = await cardsFromPage(page, source);
    const profile = toLegacyItemProfile(identification);
    const comparable = raw.filter((card) => identityMatches(profile, `${card.title} ${card.text}`));
    const signals = comparable.slice(0, LIMITS[source]).map((card) => parseAuctionCard(source, card, identification, evidence));
    return { source, status: signals.length ? "succeeded" : "no_results", candidatesSeen: raw.length, comparableSignals: signals.length, signals };
  } catch {
    return { source, status: "failed", candidatesSeen: 0, comparableSignals: 0, signals: [] };
  }
}

export function skippedAuctionSources(): AuctionSourceSummary[] {
  return (["Yahoo Auctions", "Mandarake Auction"] as const).map((source) => ({ source, status: "skipped", candidatesSeen: 0, comparableSignals: 0, signals: [] }));
}

export async function captureAuctionSearches(args: { identification: DetectionResult; collectorEvidence: CollectorEvidence | null; headless: boolean }): Promise<AuctionSourceSummary[]> {
  const keyword = buildAuctionKeyword(args.identification);
  const browser = await chromium.launch({ headless: args.headless });
  try {
    const context = await browser.newContext({ locale: "ja-JP" });
    const yahoo = await context.newPage();
    const mandarake = await context.newPage();
    return await Promise.all([
      captureSource(yahoo, "Yahoo Auctions", buildYahooAuctionUrl(keyword), args.identification, args.collectorEvidence),
      captureSource(mandarake, "Mandarake Auction", buildMandarakeAuctionUrl(keyword), args.identification, args.collectorEvidence),
    ]);
  } finally {
    await browser.close();
  }
}
