import { describe, expect, it } from "vitest";

import { fixtureResult } from "../src/server/analysis/fixture-result";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { coordinateMarketplaceSearches } from "../src/server/providers/marketplaces/coordinator";
import { marketplaceRegistry } from "../src/server/providers/marketplaces/registry";
import { selectMarketplaceProviders } from "../src/server/providers/marketplaces/selector";
import { buildMercariKeyword } from "../src/server/providers/marketplaces/mercari";
import { buildMarketplaceKeyword } from "../src/server/providers/marketplaces/shared/keyword";
import type { RakutenListingCandidate } from "../src/price/types";

describe("marketplace provider registry", () => {
  it("selects only the existing Rakuten and Mercari providers in their current order", () => {
    const fixture = fixtureResult({ collectorMode: false });
    const profile = toPriceItemProfile(fixture.identification);

    expect(selectMarketplaceProviders(profile).map((provider) => provider.source)).toEqual(["Rakuten", "Mercari"]);
    expect(marketplaceRegistry.filter((entry) => entry.status === "disabled").map((entry) => entry.id)).toEqual([
      "Yahoo!フリマ", "Rakuma", "Surugaya", "BOOKOFF", "HARD OFF", "2nd STREET", "Yahoo! Auctions", "Mandarake",
    ]);
  });

  it("preserves normalized queries, source ordering, and SearchSnapshot candidate data", async () => {
    const fixture = fixtureResult({ collectorMode: false });
    const profile = toPriceItemProfile(fixture.identification);
    const keyword = '中古 "ポケモンカード151 リザードン"';
    const rakutenCandidate: RakutenListingCandidate = {
      source: "Rakuten", rank: 1, title: "中古 リザードン", displayedPrice: 12000,
      url: "https://item.rakuten.co.jp/shop/item", shopName: "shop", availabilityText: "",
    };
    const mercariCandidate: RakutenListingCandidate = {
      source: "Mercari", rank: 1, title: "リザードン", displayedPrice: 11000,
      url: "https://jp.mercari.com/item/example", shopName: "individual_seller", availabilityText: "",
    };
    const candidates = [[rakutenCandidate], [mercariCandidate]];
    const visited: string[] = [];
    let pageIndex = 0;
    const context = {
      async newPage() {
        const index = pageIndex++;
        return {
          async goto(url: string) { visited.push(url); },
          async waitForSelector() {},
          async evaluate() { return candidates[index]; },
          async close() {},
        };
      },
    };

    const coordinated = await coordinateMarketplaceSearches({
      profile,
      keyword,
      maxCardsPerSource: 30,
      getBrowserContext: async () => context as never,
    });

    expect(coordinated.snapshot.sources.map(({ source }) => source)).toEqual(["Rakuten", "Mercari"]);
    expect(coordinated.snapshot.sources.map(({ keyword: normalized }) => normalized)).toEqual([
      '中古 ポケモンカード151 リザードン',
      'ポケモンカード151 リザードン',
    ]);
    expect(coordinated.snapshot.sources.map(({ candidates: found }) => found)).toEqual(candidates);
    expect(coordinated.snapshot.sources.every(({ error }) => error === null)).toBe(true);
    expect(Object.keys(coordinated.durationMsBySource)).toEqual(["Rakuten", "Mercari"]);
    expect(visited[0]).toMatch(/^https:\/\/search\.rakuten\.co\.jp\/search\/mall\//);
    expect(visited[1]).toContain("https://jp.mercari.com/search?keyword=");
    expect(visited[1]).toContain("&status=on_sale");
    expect(buildMarketplaceKeyword('「QUINTET」 五重奏団')).toBe("");
    expect(buildMercariKeyword('中古 “リザードン”')).toBe("リザードン");
  });
});