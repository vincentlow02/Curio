import type { Page } from "playwright-core";

import { MARKETPLACE_IDS } from "../../../core/marketplace";
import type { MarketplaceCandidate } from "../../../price/types";
import { captureBrowserSearch, type BrowserMarketplaceProvider } from "./shared/browser-search";
import { buildMarketplaceKeyword } from "./shared/keyword";

export function buildMercariKeyword(keyword: string): string {
  return buildMarketplaceKeyword(keyword).replace(/中古/g, " ").replace(/\s+/g, " ").trim();
}

function buildMercariSearchUrl(keyword: string): string {
  return `https://jp.mercari.com/search?keyword=${encodeURIComponent(buildMercariKeyword(keyword))}&status=on_sale`;
}

type MercariApiItem = {
  id?: string | number | null;
  name?: string | null;
  price?: string | number | null;
  status?: string | null;
  itemType?: string | null;
  shop?: unknown;
  itemConditionId?: string | number | null;
};

function normalizeMercariApiCandidates(items: unknown[], maxCards: number): { candidates: MarketplaceCandidate[]; diagnostics: Array<Record<string, unknown>>; rejectionReasons: Array<Record<string, unknown>> } {
  const candidates: MarketplaceCandidate[] = [];
  const diagnostics: Array<Record<string, unknown>> = [];
  const rejectionReasons: Array<Record<string, unknown>> = [];
  if (!Array.isArray(items) || items.length === 0) {
    return { candidates, diagnostics: [{ stage: "api_no_response", message: "No Mercari item array returned" }], rejectionReasons: [{ reason: "API_NO_RESPONSE", message: "No Mercari item array returned" }] };
  }
  for (const item of items) {
    const record = (item ?? {}) as MercariApiItem;
    const id = record.id ?? null;
    const title = typeof record.name === "string" ? record.name.trim() : "";
    const rawPrice = record.price;
    const price = Number.parseInt(String(rawPrice ?? ""), 10);
    const isOnSale = record.status === "ITEM_STATUS_ON_SALE";
    const isApplicable = !record.shop && (!record.itemType || record.itemType === "ITEM_TYPE_MERCARI");
    if (!id || !title || !Number.isFinite(price) || price <= 0) {
      rejectionReasons.push({ reason: "INVALID_RESPONSE", id: id ?? null, title, price: rawPrice ?? null, message: "Mercari item missing required title/price/id" });
      continue;
    }
    if (!isOnSale) {
      rejectionReasons.push({ reason: "NOT_ON_SALE", id, title, message: "Item is not on sale" });
      continue;
    }
    if (!isApplicable) {
      rejectionReasons.push({ reason: "SHOP_ONLY_OR_UNSUPPORTED", id, title, itemType: record.itemType ?? null, message: "Shop or unsupported Mercari listing type" });
      continue;
    }
    candidates.push({
      source: MARKETPLACE_IDS.mercari,
      rank: candidates.length + 1,
      title,
      displayedPrice: price,
      url: `https://jp.mercari.com/item/${id}`,
      shopName: "individual_seller",
      imageUrl: null,
      availabilityText: "",
      listingCondition: "unknown",
      availabilityStatus: "available",
    });
    if (diagnostics.length < 2) {
      diagnostics.push({
        id,
        title,
        price,
        url: `https://jp.mercari.com/item/${id}`,
        source: "api_response",
      });
    }
    if (candidates.length >= maxCards) break;
  }
  return { candidates, diagnostics, rejectionReasons };
}

async function captureMercari(page: Page, maxCards: number, apiItems: unknown[] | null): Promise<{ candidates: MarketplaceCandidate[]; diagnostics: Array<Record<string, unknown>>; rejectionReasons: Array<Record<string, unknown>> }> {
  const sourceId = MARKETPLACE_IDS.mercari;
  if (apiItems?.length) {
    const parsed = normalizeMercariApiCandidates(apiItems, maxCards);
    if (parsed.candidates.length > 0) return parsed;
  }
  try {
    await page.waitForSelector("a[href*='/item/']", { timeout: 10_000 });
  } catch {
    return {
      candidates: [],
      diagnostics: [{ stage: "selector_wait", message: "No item anchor matched within 10s" }],
      rejectionReasons: [{ reason: "EMPTY", message: "No item anchor matched within 10s" }],
    };
  }
  return page.evaluate(({ limit, sourceId }): { candidates: MarketplaceCandidate[]; diagnostics: Array<Record<string, unknown>>; rejectionReasons: Array<Record<string, unknown>> } => {
    const results: MarketplaceCandidate[] = [];
    const urls = new Set<string>();
    const diagnostics: Array<Record<string, unknown>> = [];
    const rejectionReasons: Array<Record<string, unknown>> = [];
    const itemLinks = [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/item/']")];
    for (const anchor of itemLinks) {
      const href = anchor.href;
      if (!/^https:\/\/jp\.mercari\.com\/item\//i.test(href)) {
        rejectionReasons.push({ reason: "href_mismatch", href, message: "Not a Mercari item URL" });
        continue;
      }
      if (urls.has(href)) {
        rejectionReasons.push({ reason: "duplicate_url", href, message: "Duplicate item URL" });
        continue;
      }
      urls.add(href);
      let node: HTMLElement | null = anchor;
      let cardNode: HTMLElement | null = null;
      const anchorText = (anchor.textContent || "").replace(/\s+/g, " ").trim();
      let cardText = anchorText;
      for (let depth = 0; depth < 6 && node?.parentElement; depth += 1) {
        node = node.parentElement;
        const text = (node.innerText || "").replace(/\s+/g, " ").trim();
        if (/(?:¥\s*[\d,]+|[\d,]+\s*円)/.test(text) && text.length <= 1500) {
          cardText = text;
          cardNode = node;
          break;
        }
      }
      const priceMatch = cardText.match(/(?:¥\s*|^)([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,})(?:\s*円)?/);
      const imageElement = cardNode?.querySelector<HTMLImageElement>("img") ?? anchor.querySelector<HTMLImageElement>("img");
      const rawImageUrl = imageElement?.currentSrc || imageElement?.src || null;
      let imageUrl: string | null = null;
      try {
        const parsedImageUrl = rawImageUrl ? new URL(rawImageUrl) : null;
        if (parsedImageUrl?.protocol === "https:" && !parsedImageUrl.username && !parsedImageUrl.password) imageUrl = parsedImageUrl.href;
      } catch {
        imageUrl = null;
      }
      const roleImageAriaLabel = cardNode?.querySelector('[role="img"][aria-label]')?.getAttribute("aria-label") ?? anchor.querySelector('[role="img"][aria-label]')?.getAttribute("aria-label") ?? null;
      const imageAlt = cardNode?.querySelector("img[alt]")?.getAttribute("alt") ?? anchor.querySelector("img[alt]")?.getAttribute("alt") ?? null;
      const anchorAriaLabel = anchor.getAttribute("aria-label") ?? cardNode?.querySelector("a[aria-label]")?.getAttribute("aria-label") ?? null;
      const cardTitleAttribute = cardNode?.querySelector("[title]")?.getAttribute("title") ?? null;
      const anchorTitleAttribute = anchor.getAttribute("title");
      const titleFields = [
        ["role-img aria-label", roleImageAriaLabel],
        ["img alt", imageAlt],
        ["anchor aria-label", anchorAriaLabel],
        ["title attribute", cardTitleAttribute ?? anchorTitleAttribute],
        ["card text", cardText],
        ["anchor text", anchorText],
      ];
      let title = "";
      let titleSource = "none";
      for (const [source, value] of titleFields) {
        const cleaned = (value || "").replace(/^現在\s*/i, "").replace(/^¥\s*[\d,]+\s*/, "").replace(/^[\d,]+\s*円\s*/, "").replace(/\s*(?:¥\s*[\d,]+|[\d,]+\s*円)\s*$/, "").trim();
        if (cleaned.length >= 4 && !/^(商品画像|商品画像を表示|item image|product image|image)$/i.test(cleaned)) {
          title = cleaned;
          titleSource = source as string;
          break;
        }
      }
      if (title.length < 4) {
        rejectionReasons.push({
          reason: "title_invalid",
          href,
          titleSource,
          anchorText,
          cardText,
          ariaLabel: anchorAriaLabel,
          imageAlt,
          titleAttribute: cardTitleAttribute ?? anchorTitleAttribute,
          priceFound: priceMatch !== null,
        });
        continue;
      }
      results.push({
        source: sourceId,
        rank: results.length + 1,
        title,
        displayedPrice: priceMatch ? Number(priceMatch[1]!.replace(/,/g, "")) : null,
        url: href,
        shopName: "individual_seller",
        imageUrl,
        availabilityText: "",
        listingCondition: "unknown",
        availabilityStatus: "unknown",
      });
      if (results.length >= limit) break;
      if (diagnostics.length < 2) {
        diagnostics.push({
          href,
          title,
          titleSource,
          price: priceMatch ? Number(priceMatch[1]!.replace(/,/g, "")) : null,
          ariaLabel: anchorAriaLabel,
          imageAlt,
          titleAttribute: cardTitleAttribute ?? anchorTitleAttribute,
          anchorText,
          cardText,
        });
      }
    }
    return { candidates: results, diagnostics, rejectionReasons };
  }, { limit: maxCards, sourceId });
}

export const mercariProvider: BrowserMarketplaceProvider = {
  source: MARKETPLACE_IDS.mercari,
  runtime: "browser",
  supportsProfile: () => true,
  searchWithBrowser(args) {
    const normalizedKeyword = buildMercariKeyword(args.keyword);
    let apiItemsPromise: Promise<unknown[] | null> = Promise.resolve(null);
    return captureBrowserSearch({
      context: args.context,
      source: MARKETPLACE_IDS.mercari,
      keyword: normalizedKeyword,
      searchUrl: buildMercariSearchUrl(args.keyword),
      maxCards: args.maxCards,
      beforeNavigation: async (page) => {
        if (typeof page.waitForResponse !== "function") return;
        apiItemsPromise = page.waitForResponse((response) => {
          const request = response.request();
          if (!request || request.method() !== "POST") return false;
          try {
            const url = new URL(response.url());
            return url.hostname === "api.mercari.jp" && url.pathname === "/v2/entities";
          } catch {
            return false;
          }
        }, { timeout: 10_000 })
          .then((response) => response.json())
          .then((body) => Array.isArray(body?.items) ? body.items as unknown[] : null)
          .catch(() => null);
      },
      ...(args.onPageOpened ? { onPageOpened: args.onPageOpened } : {}),
      ...(args.onRequest ? { onRequest: args.onRequest } : {}),
      ...(args.onHttpRequestStarted ? { onHttpRequestStarted: args.onHttpRequestStarted } : {}),
      ...(args.onHttpRequestCompleted ? { onHttpRequestCompleted: args.onHttpRequestCompleted } : {}),
      capture: async (page, maxCards) => {
        const apiItems = await apiItemsPromise;
        return captureMercari(page, maxCards, apiItems);
      },
    });
  },
};