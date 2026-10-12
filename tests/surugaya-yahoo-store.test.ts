import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { fixtureResult } from "../src/server/analysis/fixture-result";
import { disabledStoreSnapshot } from "../src/price/store-verifier";
import { disabledTavilyFallback } from "../src/price/tavily-price-fallback";
import { buildPriceResult } from "../src/price/matcher";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { parseSurugayaYahooStoreSearchPage } from "../src/server/providers/marketplaces/surugaya-yahoo-store";
import { surugayaYahooStoreProvider } from "../src/server/providers/marketplaces/surugaya-yahoo-store";

const testPage = `<!doctype html>
<html><head><link rel="canonical" href="https://store.shopping.yahoo.co.jp/suruga-ya/search.html?p=psp"></head><body>
<main class="js-target-main-content">
  <div class="SearchResult_SearchResultItem__card"><a href="https://store.shopping.yahoo.co.jp/suruga-ya/a001.html?tracking=title"><span class="ItemTitle_SearchResultItemTitle__text">中古 PSP-3000 有在庫</span></a><span class="ItemPrice_ItemPrice__amount">12,000円</span><span class="ItemPointModal_PointText__point">9,999pt</span></div>
  <div class="SearchResult_SearchResultItem__card"><a href="https://store.shopping.yahoo.co.jp/suruga-ya/a002.html"><span class="ItemTitle_SearchResultItemTitle__text">中古 PSP-3000 缺货</span></a><span class="ItemPrice_ItemPrice__amount">13,000円</span></div>
  <div class="SearchResult_SearchResultItem__card"><a href="https://store.shopping.yahoo.co.jp/suruga-ya/a003.html"><span class="ItemTitle_SearchResultItemTitle__text">中古 PSP-3000 状态未知</span></a><span class="ItemPrice_ItemPrice__amount">14,000円</span></div>
</main>
<aside class="recommendations"><div class="SearchResult_SearchResultItem__card"><a href="https://store.shopping.yahoo.co.jp/suruga-ya/recommended.html"><span class="ItemTitle_SearchResultItemTitle__text">推荐项</span></a><span class="ItemPrice_ItemPrice__amount">1円</span></div></aside>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"results":[{"url":"https://store.shopping.yahoo.co.jp/suruga-ya/a001.html","stock":{"noTypeText":"在庫あり"}},{"url":"https://store.shopping.yahoo.co.jp/suruga-ya/a002.html","stock":{"noTypeText":"在庫なし"}}]}}}</script>
</body></html>`;

describe("Surugaya Yahoo Store parser", () => {
  it("keeps the provider and registry disabled without explicit data-use authorization", async () => {
    const previousGate = process.env.SURUGAYA_YAHOO_STORE_DATA_LICENSE_VERIFIED;
    delete process.env.SURUGAYA_YAHOO_STORE_DATA_LICENSE_VERIFIED;
    vi.resetModules();
    try {
      const { marketplaceRegistry: isolatedRegistry } = await import("../src/server/providers/marketplaces/registry");
      const profile = toPriceItemProfile(fixtureResult({ collectorMode: false }).identification);
      const registration = isolatedRegistry.find((entry) => entry.id === "Surugaya Yahoo Store");
      const result = await surugayaYahooStoreProvider.search({ profile, keyword: "psp", maxCards: 10 });

      expect(surugayaYahooStoreProvider.supportsProfile(profile)).toBe(false);
      expect(registration?.status).toBe("disabled");
      expect(result.error).toContain("configuration_error: Surugaya Yahoo Store data-use authorization is not verified.");
      expect(result.candidates).toEqual([]);
    } finally {
      if (previousGate === undefined) delete process.env.SURUGAYA_YAHOO_STORE_DATA_LICENSE_VERIFIED;
      else process.env.SURUGAYA_YAHOO_STORE_DATA_LICENSE_VERIFIED = previousGate;
      vi.resetModules();
    }
  });

  it("keeps each card’s own price, canonical item URL, and structured availability", () => {
    const parsed = parseSurugayaYahooStoreSearchPage(testPage, "psp");

    expect(parsed.error).toBeNull();
    expect(parsed.itemBoxCount).toBe(3);
    expect(parsed.listings).toEqual([
      { title: "中古 PSP-3000 有在庫", price: 12000, url: "https://store.shopping.yahoo.co.jp/suruga-ya/a001.html", availability: "IN_STOCK" },
      { title: "中古 PSP-3000 缺货", price: 13000, url: "https://store.shopping.yahoo.co.jp/suruga-ya/a002.html", availability: "OUT_OF_STOCK" },
      { title: "中古 PSP-3000 状态未知", price: 14000, url: "https://store.shopping.yahoo.co.jp/suruga-ya/a003.html", availability: "UNKNOWN" },
    ]);
    expect(parsed.candidates.map(({ displayedPrice, availabilityText }) => [displayedPrice, availabilityText])).toEqual([
      [12000, ""], [13000, "在庫なし"], [null, "unknown"],
    ]);
  });

  it("does not turn an UNKNOWN listing into a Pipeline B price sample", () => {
    const parsed = parseSurugayaYahooStoreSearchPage(testPage, "psp");
    const unknownCandidate = parsed.candidates[2]!;
    const profile = toPriceItemProfile(fixtureResult({ collectorMode: false }).identification);
    const built = buildPriceResult({
      profile,
      snapshot: {
        version: 2,
        capturedAt: "2026-10-11T00:00:00.000Z",
        sources: [{ source: unknownCandidate.source as "Surugaya Yahoo Store", keyword: "psp", searchUrl: "https://store.shopping.yahoo.co.jp/suruga-ya/search.html?p=psp", error: null, candidates: [unknownCandidate] }],
      },
      tavilyFallback: disabledTavilyFallback(profile),
      storeSnapshot: disabledStoreSnapshot(),
      maxCardsScannedPerSource: 30,
      maxSamplesPerSource: 5,
    });

    expect(built.result.samples).toEqual([]);
    expect(built.excluded).toContainEqual({ source: "Surugaya Yahoo Store", rank: 3, url: "https://store.shopping.yahoo.co.jp/suruga-ya/a003.html", reason: "missing_price" });
  });

  it.skipIf(!process.env.SURUGAYA_YAHOO_STORE_CAPTURE_PATH || !existsSync(process.env.SURUGAYA_YAHOO_STORE_CAPTURE_PATH))(
    "replays the saved Yahoo store HTML without network access",
    () => {
      const html = readFileSync(process.env.SURUGAYA_YAHOO_STORE_CAPTURE_PATH!, "utf8");
      const parsed = parseSurugayaYahooStoreSearchPage(html, "PSP-3000");

      expect(parsed.error).toBeNull();
      expect(parsed.itemBoxCount).toBe(10);
      expect(parsed.listings).toHaveLength(10);
      expect(parsed.listings.filter((listing) => listing.availability === "IN_STOCK")).toHaveLength(10);
      expect(parsed.listings.filter((listing) => listing.availability === "UNKNOWN")).toHaveLength(0);
      expect(parsed.listings[0]).toMatchObject({
        title: "中古PSPハード PSP本体バリューパック レッド・ブラック(PSP-3000)",
        price: 46200,
        url: "https://store.shopping.yahoo.co.jp/suruga-ya/177011991001.html",
        availability: "IN_STOCK",
      });
    },
  );
});