import type { AnalysisResult } from "../../core/analysis/types";

export function fixtureResult(): AnalysisResult {
  return {
    identification: { itemName: "Sony PlayStation Portable", version: "PSP-3000", priceSearchKeywordJa: "PSP-3000 本体 中古", category: "Cards & Game Collectibles" },
    priceReference: {
      currency: "JPY", low: 8000, median: 12000, high: 16000, sampleCount: 3, disclaimer: "Online asking-price reference",
      samples: [
        { title: "中古 PSP-3000 本体 ブラック", price: 8000, currency: "JPY", source: "Rakuten", url: "https://item.rakuten.co.jp/fixture/psp-1/", condition: "used", versionMatch: "exact", packageStatus: "with_box", includedInReferenceRange: true },
        { title: "PSP-3000 本体 ホワイト", price: 12000, currency: "JPY", source: "Mercari", url: "https://jp.mercari.com/item/fixture-psp-2", condition: "used", versionMatch: "exact", packageStatus: "unknown", includedInReferenceRange: true },
        { title: "PSP-3000 本体 ブルー", price: 16000, currency: "JPY", source: "Mercari", url: "https://jp.mercari.com/item/fixture-psp-3", condition: "used", versionMatch: "exact", packageStatus: "without_box", includedInReferenceRange: true },
      ],
    },
    recommendedAreas: [
      { area: "秋葉原", reason: "中古游戏主机、软件和卡牌店较集中。", searchKeywordJa: "秋葉原 中古 ゲーム カード 店舗" },
      { area: "池袋", reason: "游戏与卡牌相关商店较多，适合比较不同店铺。", searchKeywordJa: "池袋 中古 ゲーム カードショップ" },
    ],
    storeSuggestions: [],
    warnings: ["尚未取得具有来源证据的东京实体店，建议按区域关键词到店前确认。"],
    cost: { qwenCalls: 0, inputTokens: 0, outputTokens: 0, marketplacePages: 0, tavilyCalls: 0, daytonaCalls: 0, totalMs: 0 },
  };
}
