import { describe, expect, it } from "vitest";

import { MARKETPLACE_IDS } from "../src/core/marketplace";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { buildPriceResult } from "../src/price/matcher";
import { buildDiscoveryResults } from "../src/price/discovery";
import { disabledStoreSnapshot } from "../src/price/store-verifier";
import { disabledTavilyFallback } from "../src/price/tavily-price-fallback";
import type { MarketplaceCandidate, SearchSnapshot } from "../src/price/types";
import { fixtureResult } from "../src/server/analysis/fixture-result";

const profile = toPriceItemProfile(fixtureResult().identification);

function candidate(overrides: Partial<MarketplaceCandidate> = {}): MarketplaceCandidate {
  return {
    source: MARKETPLACE_IDS.mercari,
    rank: 1,
    title: "中古 PSP-3000 ブラック",
    displayedPrice: 12000,
    url: "https://jp.mercari.com/item/psp-3000-black",
    shopName: "seller",
    imageUrl: "https://static.example.test/psp.jpg",
    availabilityText: "",
    listingCondition: "used",
    availabilityStatus: "available",
    ...overrides,
  };
}

function snapshot(candidates: MarketplaceCandidate[], extra: Partial<SearchSnapshot["sources"][number]> = {}): SearchSnapshot {
  return {
    version: 2,
    capturedAt: "fixture",
    sources: [{ source: MARKETPLACE_IDS.mercari, keyword: "PSP-3000", searchUrl: "", error: null, candidates, ...extra }],
  };
}

describe("marketplace discovery", () => {
  it("keeps an identity-reliable candidate even when Pricing rejects its missing price", () => {
    const missingPrice = candidate({ displayedPrice: null, imageUrl: null, listingCondition: "unknown", availabilityStatus: "unknown" });
    const result = buildDiscoveryResults(profile, snapshot([missingPrice]));
    const priced = buildPriceResult({
      profile,
      snapshot: snapshot([missingPrice]),
      tavilyFallback: disabledTavilyFallback(profile),
      storeSnapshot: disabledStoreSnapshot(),
      maxCardsScannedPerSource: 30,
      maxSamplesPerSource: 5,
    });

    expect(priced.result.samples).toEqual([]);
    expect(priced.excluded[0]?.reason).toBe("missing_price");
    expect(result).toMatchObject([{
      title: missingPrice.title,
      price: null,
      imageUrl: null,
      availability: "unknown",
      condition: "unknown",
      matchConfidence: "exact",
    }]);
  });

  it("rejects conflicting models, obvious accessories, and unrelated items", () => {
    const results = buildDiscoveryResults(profile, snapshot([
      candidate({ title: "中古 PSP-2000 ブラック", url: "https://jp.mercari.com/item/wrong-model" }),
      candidate({ title: "PSP-3000 充電器のみ", url: "https://jp.mercari.com/item/charger" }),
      candidate({ title: "Nintendo Switch Joy-Con", url: "https://jp.mercari.com/item/unrelated" }),
    ]));

    expect(results).toEqual([]);
  });

  it("labels uncertain identity as possible and keeps damaged items visible", () => {
    const results = buildDiscoveryResults(profile, snapshot([
      candidate({ title: "Sony PSP handheld console", url: "https://jp.mercari.com/item/uncertain" }),
      candidate({ title: "中古 PSP-3000 ジャンク 動作不良", url: "https://jp.mercari.com/item/damaged" }),
    ]));

    expect(results).toMatchObject([
      { url: "https://jp.mercari.com/item/uncertain", matchConfidence: "possible", damaged: false },
      { url: "https://jp.mercari.com/item/damaged", matchConfidence: "exact", damaged: true },
    ]);
  });

  it("lets the identity matcher decide when the product type is unconfirmed", () => {
    const unconfirmedType = candidate({
      title: "中古 PSP handheld console",
      url: "https://jp.mercari.com/item/psp-unconfirmed-type",
    });
    const results = buildDiscoveryResults(profile, snapshot([unconfirmedType]));
    const priced = buildPriceResult({
      profile,
      snapshot: snapshot([unconfirmedType]),
      tavilyFallback: disabledTavilyFallback(profile),
      storeSnapshot: disabledStoreSnapshot(),
      maxCardsScannedPerSource: 30,
      maxSamplesPerSource: 5,
    });

    expect(results).toMatchObject([{
      url: "https://jp.mercari.com/item/psp-unconfirmed-type",
      matchConfidence: "possible",
    }]);
    expect(priced.result.samples).toEqual([]);
    expect(priced.excluded[0]?.reason).toBe("unconfirmed_model");
  });

  it("does not promote an explicit unknown stock state to in-stock", () => {
    const result = buildDiscoveryResults(profile, snapshot([candidate({
      source: MARKETPLACE_IDS.yahooShopping,
      availabilityText: "",
      availabilityStatus: "unknown",
    })], { source: MARKETPLACE_IDS.yahooShopping }));

    expect(result[0]?.availability).toBe("unknown");
  });

  it("deduplicates equivalent links after removing tracking parameters", () => {
    const results = buildDiscoveryResults(profile, snapshot([
      candidate({ url: "https://jp.mercari.com/item/same-item?tracking=first" }),
      candidate({ rank: 2, url: "https://jp.mercari.com/item/same-item?tracking=second" }),
    ]));

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://jp.mercari.com/item/same-item");
  });

  it("enriches Surugaya unknown-stock candidates from existing diagnostics", () => {
    const surugaya = candidate({
      source: MARKETPLACE_IDS.surugayaYahooStore,
      displayedPrice: null,
      url: "https://store.shopping.yahoo.co.jp/suruga-ya/item.html?tracking=api",
      imageUrl: null,
      availabilityText: "unknown",
      availabilityStatus: "unknown",
      listingCondition: "unknown",
    });
    const result = buildDiscoveryResults(profile, snapshot([surugaya], {
      source: MARKETPLACE_IDS.surugayaYahooStore,
      diagnostics: [{ kind: "listing_discovery", listings: [{ title: surugaya.title, price: 13500, url: "https://store.shopping.yahoo.co.jp/suruga-ya/item.html", availability: "UNKNOWN" }] }],
    }));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: MARKETPLACE_IDS.surugayaYahooStore, price: 13500, availability: "unknown" });
  });

  it("rejects unsafe links and caps discovery output", () => {
    const candidates = [candidate({ rank: 0, url: "javascript:alert(1)" }), ...Array.from({ length: 35 }, (_, index) => candidate({
      rank: index + 1,
      url: `https://jp.mercari.com/item/psp-3000-${index}`,
    }))];

    const results = buildDiscoveryResults(profile, snapshot(candidates));

    expect(results).toHaveLength(8);
    expect(results.every(({ url }) => url.startsWith("https://"))).toBe(true);
  });
});
