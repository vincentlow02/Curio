export const ITEM_CATEGORIES = [
  "Toys & Character Collectibles",
  "Cards & Game Collectibles",
  "Records & Music Collectibles",
  "unknown",
] as const;

export const ITEM_SUBTYPES = [
  "toys_character",
  "trading_cards",
  "retro_games",
  "records_vinyl",
  "music_memorabilia",
  "unknown",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemSubtype = (typeof ITEM_SUBTYPES)[number];

export type RecommendedArea = {
  area: string;
  reason: string;
  storeSearchKeywordJa: string;
};

export type ItemProfile = {
  itemName: string;
  brandCharacterSeries: string;
  versionOrPeriod: string;
  color: string;
  category: ItemCategory;
  subtype: ItemSubtype;
  searchKeywordsJa: string[];
  priceSearchKeywordJa: string;
  recommendedAreas: RecommendedArea[];
  storeRecommendationDisclaimer: string;
  notes: string[];
};

export const STORE_DISCLAIMER =
  "候选区域和店铺根据商品类别与通常经营范围推荐，不代表实时库存；请在出发前自行确认店铺状态。";
