import type { PokemonCardIdentity, ProductType } from "../core/profile/types";

const ITEM_CATEGORIES = [
  "Toys & Character Collectibles",
  "Cards & Game Collectibles",
  "Records & Music Collectibles",
  "unknown",
] as const;

const ITEM_SUBTYPES = [
  "toys_character",
  "trading_cards",
  "retro_games",
  "records_vinyl",
  "music_memorabilia",
  "unknown",
] as const;

type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemSubtype = (typeof ITEM_SUBTYPES)[number];

type RecommendedArea = {
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
  productType?: ProductType;
  searchKeywordsJa: string[];
  priceSearchKeywordJa: string;
  recommendedAreas: RecommendedArea[];
  storeRecommendationDisclaimer: string;
  notes: string[];
  pokemonCard?: PokemonCardIdentity;
};

const BOOK = /攻略本|攻略書|公式(?:パーフェクト)?ガイド|パーフェクトガイド|設定資料集|原画集|ムック|書籍|\bBOOK\b|ISBN/i;
const ACCESSORY = /ケースのみ|説明書のみ|充電器のみ|バッテリーのみ|液晶のみ|交換部品|パーツのみ|保護カバーのみ|収納ケースのみ/i;
const GAME_PLATFORM = /(?:NINTENDO\s*)?(?:3DS|2DS|DS|SWITCH)|PSP(?:-\d+)?|PS\s*VITA|PLAYSTATION|PS[1-5]|XBOX|ゲームボーイ|GAME\s*BOY/i;

export function explicitProductType(text: string): ProductType | null {
  if (BOOK.test(text)) return "book";
  if (ACCESSORY.test(text)) return "accessory";
  if (/ゲームソフト|ソフトのみ|カセットのみ|ROM(?:カセット)?(?:のみ)?|UMD(?:のみ)?/i.test(text)) return "game_software";
  if (/ゲーム機本体/i.test(text) || (/本体/i.test(text) && GAME_PLATFORM.test(text))) return "game_hardware";
  if (/トレーディングカード|ポケモンカード|遊戯王[^\s]{0,12}カード|カード\s*(?:のみ|単品)/i.test(text)) return "trading_card";
  if (/フィギュア|ソフビ|スタチュー|ドール/i.test(text)) return "figure";
  if (/アクリルスタンド|アクスタ|キーホルダー|缶バッジ|ぬいぐるみ/i.test(text)) return "character_goods";
  if (/\b(?:LP|VINYL)\b|レコード|アナログ盤/i.test(text)) return "record";
  if (/\bCD\b|コンパクトディスク/i.test(text)) return "cd";
  if (/音楽ポスター|ツアーグッズ|コンサートグッズ|MUSIC\s+MEMORABILIA/i.test(text)) return "music_memorabilia";
  if (/(?:カメラ|スマートフォン|ヘッドホン|イヤホン|プレーヤー)\s*本体/i.test(text)) return "electronics";
  return null;
}

export function inferProductType(category: ItemCategory, text: string, hasPokemonCard = false): ProductType {
  if (hasPokemonCard) return "trading_card";
  const explicit = explicitProductType(text);
  if (explicit) return explicit;
  if (category === "Toys & Character Collectibles" && /TOY|玩具/i.test(text)) return "figure";
  return "unknown";
}

export const STORE_DISCLAIMER =
  "候选区域和店铺根据商品类别与通常经营范围推荐，不代表实时库存；请在出发前自行确认店铺状态。";
