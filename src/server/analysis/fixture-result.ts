import type { AnalysisResult } from "../../core/analysis/types";

export function fixtureResult(options: { collectorMode?: boolean } = {}): AnalysisResult {
  const collectorMode = options.collectorMode ?? false;
  return {
    collectorMode,
    collectorEvidence: collectorMode ? {
      editionSignals: ["PSP-3000 model marking"],
      conditionSignals: ["Front shell is visible"],
      visibleIdentifiers: ["PSP-3000"],
      missingEvidence: ["Back label, packaging and included accessories are not visible"],
    } : null,
    auctionSources: collectorMode ? [
      {
        source: "Yahoo Auctions", status: "succeeded", candidatesSeen: 4, comparableSignals: 1,
        signals: [{ source: "Yahoo Auctions", title: "Sony PSP-3000 console black", currentPrice: 7200, startingPrice: null, buyNowPrice: 11000, bidCount: 3, remainingTime: "1 day", conditionText: "used", matchedEvidence: ["PSP-3000"], unresolvedDifferences: ["Packaging and accessories cannot be confirmed"], url: "https://auctions.yahoo.co.jp/jp/auction/fixture-psp" }],
      },
      {
        source: "Mandarake Auction", status: "succeeded", candidatesSeen: 2, comparableSignals: 1,
        signals: [{ source: "Mandarake Auction", title: "Sony PSP-3000 Console", currentPrice: 9000, startingPrice: 8000, buyNowPrice: null, bidCount: 2, remainingTime: "2days", conditionText: "pre-owned", matchedEvidence: ["PSP-3000"], unresolvedDifferences: ["Packaging and accessories cannot be confirmed"], url: "https://ekizo.mandarake.co.jp/auction/item/itemInfoEn.html?index=fixture-psp" }],
      },
    ] : [
      { source: "Yahoo Auctions", status: "skipped", candidatesSeen: 0, comparableSignals: 0, signals: [] },
      { source: "Mandarake Auction", status: "skipped", candidatesSeen: 0, comparableSignals: 0, signals: [] },
    ],
    identification: { itemName: "ソニー PSP-3000", version: "PSP-3000", priceSearchKeywordJa: "PSP-3000 本体 中古", category: "Cards & Game Collectibles" },
    priceReference: {
      currency: "JPY", low: 8000, median: 12000, high: 16000, sampleCount: 3, disclaimer: "Online asking-price reference",
      samples: [
        { title: "中古 PSP-3000 本体 ブラック", price: 8000, currency: "JPY", source: "Rakuten", url: "https://item.rakuten.co.jp/fixture/psp-1/", condition: "used", versionMatch: "exact", packageStatus: "with_box", includedInReferenceRange: true },
        { title: "PSP-3000 本体 ホワイト", price: 12000, currency: "JPY", source: "Mercari", url: "https://jp.mercari.com/item/fixture-psp-2", condition: "used", versionMatch: "exact", packageStatus: "unknown", includedInReferenceRange: true },
        { title: "PSP-3000 本体 ブルー", price: 16000, currency: "JPY", source: "Mercari", url: "https://jp.mercari.com/item/fixture-psp-3", condition: "used", versionMatch: "exact", packageStatus: "without_box", includedInReferenceRange: true },
      ],
    },
    recommendedAreas: [
      { area: "Akihabara", reason: "A dense area for second-hand game consoles, software and card shops.", searchKeywordJa: "秋葉原 中古 ゲーム カード 店舗" },
      { area: "Ikebukuro", reason: "A useful area for comparing game, card and second-hand hobby stores.", searchKeywordJa: "池袋 中古 ゲーム カードショップ" },
    ],
    storeSuggestions: [],
    warnings: ["No Tokyo physical store with verified source evidence is available yet. Confirm before visiting."],
    cost: { qwenCalls: 0, inputTokens: 0, outputTokens: 0, marketplacePages: 0, auctionPages: 0, tavilyCalls: 0, daytonaCalls: 0, totalMs: 0 },
  };
}
