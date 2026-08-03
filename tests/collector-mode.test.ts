import { describe, expect, it } from "vitest";
import type { DetectionResult } from "../src/core/profile/types";
import { buildAuctionKeyword, buildMandarakeAuctionUrl, buildYahooAuctionUrl, parseAuctionCard, skippedAuctionSources } from "../src/server/providers/auctions/capture-auctions";
import { fixtureResult } from "../src/server/analysis/fixture-result";

const identification: DetectionResult = {
  itemName: "Sony PlayStation Portable",
  version: "PSP-3000",
  priceSearchKeywordJa: "PSP-3000 本体 中古",
  category: "Cards & Game Collectibles",
};

describe("collector auction boundaries", () => {
  it("uses one normalized keyword for both bounded public searches", () => {
    const keyword = buildAuctionKeyword(identification);
    expect(keyword).toBe("PSP-3000 本体");
    expect(buildYahooAuctionUrl(keyword)).toContain("auctions.yahoo.co.jp/search/search?p=");
    expect(buildMandarakeAuctionUrl(keyword)).toContain("ekizo.mandarake.co.jp/auction/item/itemsListEn.html?keywords=1&t=0&q=");
  });

  it("builds a single auction keyword for all three collectible categories", () => {
    const examples: DetectionResult[] = [
      { itemName: "MEDICOM TOY Astro Boy", version: "unknown", priceSearchKeywordJa: "鉄腕アトム ソフビ 中古", category: "Toys & Character Collectibles" },
      identification,
      { itemName: "Tatsuro Yamashita For You LP", version: "1982", priceSearchKeywordJa: "山下達郎 FOR YOU LP 中古", category: "Records & Music Collectibles" },
    ];
    expect(examples.map(buildAuctionKeyword)).toEqual(["鉄腕アトム ソフビ", "PSP-3000 本体", "山下達郎 FOR YOU LP"]);
  });

  it("does not confuse current, starting and buy-now prices", () => {
    const evidence = { editionSignals: [], conditionSignals: [], visibleIdentifiers: ["PSP-3000"], missingEvidence: [] };
    const yahoo = parseAuctionCard("Yahoo Auctions", {
      title: "Sony PSP-3000 console",
      text: "現在価格 7,200円 即決価格 11,000円 入札 3 残り 1日 状態 中古",
      url: "https://auctions.yahoo.co.jp/jp/auction/example",
    }, identification, evidence);
    expect(yahoo).toMatchObject({ currentPrice: 7200, startingPrice: null, buyNowPrice: 11000, bidCount: 3 });

    const mandarake = parseAuctionCard("Mandarake Auction", {
      title: "Sony PSP-3000 Console",
      text: "Starting Price 8,000 Yen Current Price 9,000 Yen Bids 2 Time Left 2days Condition pre-owned",
      url: "https://ekizo.mandarake.co.jp/auction/item/itemInfoEn.html?index=example",
    }, identification, evidence);
    expect(mandarake).toMatchObject({ currentPrice: 9000, startingPrice: 8000, buyNowPrice: null, bidCount: 2 });
  });

  it("keeps auctions skipped and cost-free in normal mode", () => {
    const result = fixtureResult();
    expect(skippedAuctionSources()).toEqual(result.auctionSources);
    expect(result.collectorMode).toBe(false);
    expect(result.collectorEvidence).toBeNull();
    expect(result.cost.auctionPages).toBe(0);
  });

  it("keeps a source failure independent from marketplace pricing", () => {
    const result = fixtureResult({ collectorMode: true });
    result.auctionSources[0] = { source: "Yahoo Auctions", status: "failed", candidatesSeen: 0, comparableSignals: 0, signals: [] };
    expect(result.auctionSources[1]?.status).toBe("succeeded");
    expect(result.priceReference).toMatchObject({ low: 8000, median: 12000, high: 16000, sampleCount: 3 });
  });
});
