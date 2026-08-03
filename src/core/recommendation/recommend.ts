import type { AreaRecommendation, StoreSuggestion } from "../analysis/types";
import type { CollectibleCategory } from "../profile/types";

const AREAS: Record<CollectibleCategory, AreaRecommendation[]> = {
  "Toys & Character Collectibles": [
    { area: "Akihabara", reason: "A dense area for character goods, figures and second-hand collectibles.", searchKeywordJa: "秋葉原 中古 フィギュア ソフビ 店舗" },
    { area: "Nakano", reason: "Specialist collectible shops make this a strong area for designer toys and character goods.", searchKeywordJa: "中野 中古 キャラクターグッズ 店舗" },
  ],
  "Cards & Game Collectibles": [
    { area: "Akihabara", reason: "A dense area for second-hand game consoles, software and card shops.", searchKeywordJa: "秋葉原 中古 ゲーム カード 店舗" },
    { area: "Ikebukuro", reason: "A useful area for comparing game, card and second-hand hobby stores.", searchKeywordJa: "池袋 中古 ゲーム カードショップ" },
  ],
  "Records & Music Collectibles": [
    { area: "Shinjuku", reason: "A strong area for second-hand records, CDs and specialist music retailers.", searchKeywordJa: "新宿 中古 レコード CD 店舗" },
    { area: "Shibuya", reason: "A well-known record-shopping area with major and independent music stores.", searchKeywordJa: "渋谷 中古 レコード 音楽グッズ 店舗" },
  ],
};

export const FORBIDDEN_INVENTORY = /当前有货|现货|库存充足|一定可以买到|已确认有该商品|available now|in stock/i;

export function recommendAreas(category: CollectibleCategory): AreaRecommendation[] {
  return AREAS[category].map((area) => ({ ...area }));
}

export function verifiedStoreSuggestions(stores: Array<{ name: string; sourceUrl: string }>): StoreSuggestion[] {
  return stores.filter((store) => store.name.trim() && /^https:\/\//.test(store.sourceUrl)).map((store) => ({
    name: store.name,
    reason: "This source connects the store with the relevant collectible category. Confirm with the store before visiting.",
    sourceUrl: store.sourceUrl,
  }));
}

export function assertSafeRecommendations(areas: AreaRecommendation[], stores: StoreSuggestion[]): void {
  const text = JSON.stringify({ areas, stores });
  if (FORBIDDEN_INVENTORY.test(text)) throw new Error("The recommendation contains a prohibited real-time inventory claim.");
  if (stores.some((store) => !store.sourceUrl)) throw new Error("Every specific store suggestion must include a source URL.");
}
