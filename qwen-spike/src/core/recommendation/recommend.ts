import type { AreaRecommendation, StoreSuggestion } from "../analysis/types";
import type { CollectibleCategory } from "../profile/types";

const AREAS: Record<CollectibleCategory, AreaRecommendation[]> = {
  "Toys & Character Collectibles": [
    { area: "秋葉原", reason: "角色周边、手办与中古收藏店较集中，适合按类别寻找。", searchKeywordJa: "秋葉原 中古 フィギュア ソフビ 店舗" },
    { area: "中野", reason: "收藏品专门店密集，适合寻找设计玩具和角色商品。", searchKeywordJa: "中野 中古 キャラクターグッズ 店舗" },
  ],
  "Cards & Game Collectibles": [
    { area: "秋葉原", reason: "中古游戏主机、软件和卡牌店较集中。", searchKeywordJa: "秋葉原 中古 ゲーム カード 店舗" },
    { area: "池袋", reason: "游戏与卡牌相关商店较多，适合比较不同店铺。", searchKeywordJa: "池袋 中古 ゲーム カードショップ" },
  ],
  "Records & Music Collectibles": [
    { area: "新宿", reason: "中古唱片与音乐专门店较集中。", searchKeywordJa: "新宿 中古 レコード CD 店舗" },
    { area: "渋谷", reason: "唱片、CD 与音乐文化店铺密集。", searchKeywordJa: "渋谷 中古 レコード 音楽グッズ 店舗" },
  ],
};

export const FORBIDDEN_INVENTORY = /当前有货|现货|库存充足|一定可以买到|已确认有该商品|available now|in stock/i;

export function recommendAreas(category: CollectibleCategory): AreaRecommendation[] {
  return AREAS[category].map((area) => ({ ...area }));
}

export function verifiedStoreSuggestions(stores: Array<{ name: string; sourceUrl: string }>): StoreSuggestion[] {
  return stores.filter((store) => store.name.trim() && /^https:\/\//.test(store.sourceUrl)).map((store) => ({
    name: store.name,
    reason: "该来源显示此店与相关收藏类别有关，适合优先到店确认。",
    sourceUrl: store.sourceUrl,
  }));
}

export function assertSafeRecommendations(areas: AreaRecommendation[], stores: StoreSuggestion[]): void {
  const text = JSON.stringify({ areas, stores });
  if (FORBIDDEN_INVENTORY.test(text)) throw new Error("推荐结果包含不允许的实时库存声明。");
  if (stores.some((store) => !store.sourceUrl)) throw new Error("具体店铺建议必须包含来源 URL。");
}
