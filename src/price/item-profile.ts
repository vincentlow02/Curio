import { UNKNOWN_PRODUCT_TYPE, type PokemonCardIdentity, type ProductType } from "../core/profile/types";

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

export type ProductTypeFamily =
  | "game_software"
  | "game_hardware"
  | "trading_card"
  | "figure"
  | "character_goods"
  | "book"
  | "record"
  | "cd"
  | "music_memorabilia"
  | "electronics"
  | "accessory";

const BOOK = /攻略本|攻略書|公式(?:パーフェクト)?ガイド|パーフェクトガイド|設定資料集|原画集|ムック|書籍|写真集|画集|ISBN|\bBOOKS?\b|\bPUBLICATION\b|\bbook\b/i;
const ACCESSORY = /空箱|箱のみ|ケースのみ|説明書のみ|取扱説明書|充電器(?:のみ)?|バッテリー(?:のみ)?|液晶(?:パネル)?のみ|交換部品|交換用|パーツのみ|保護カバーのみ|収納ケースのみ|コントローラーのみ|ケーブルのみ|\bACCESSOR(?:Y|IES)\b|\bREPLACEMENT\s+PARTS?\b/i;
const GAME_PLATFORM = /(?:NINTENDO\s*)?(?:3DS|2DS|DS|SWITCH)|PSP(?:-\d+)?|PS\s*VITA|PLAYSTATION|PS[1-5]|XBOX|ゲームボーイ|GAME\s*BOY/i;
const HARDWARE_MODEL = /PSP[-\s]?\d{3,4}|PS\s*VITA|ゲームボーイ(?:カラー|アドバンス)?|GAME\s*BOY(?:\s*COLOR|\s*ADVANCE)?/i;

const FAMILY_LABELS: Readonly<Record<ProductTypeFamily, ProductType>> = {
  game_software: "ゲームソフト",
  game_hardware: "ゲーム機本体",
  trading_card: "トレーディングカード",
  figure: "フィギュア",
  character_goods: "キャラクターグッズ",
  book: "書籍",
  record: "レコード",
  cd: "CD",
  music_memorabilia: "音楽関連グッズ",
  electronics: "電子機器本体",
  accessory: "アクセサリー",
};

export function inferProductTypeFamily(text: string): ProductTypeFamily | null {
  if (BOOK.test(text)) return "book";
  if (ACCESSORY.test(text)) return "accessory";
  if (/ゲームソフト|ソフトのみ|カセットのみ|ROM(?:カセット)?(?:のみ)?|UMD(?:のみ)?|GAME[_\s-]?SOFTWARE/i.test(text)) return "game_software";
  if (/ゲーム機本体|GAME[_\s-]?HARDWARE/i.test(text) || (/本体/i.test(text) && GAME_PLATFORM.test(text)) || HARDWARE_MODEL.test(text)) return "game_hardware";
  if (/トレーディングカード|ポケモンカード|遊戯王[^\s]{0,12}カード|カード\s*(?:のみ|単品)|TRADING[_\s-]?CARD/i.test(text)) return "trading_card";
  if (/フィギュア|ソフビ|スタチュー|ドール|FIGURE/i.test(text)) return "figure";
  if (/アクリルスタンド|アクスタ|キーホルダー|缶バッジ|ぬいぐるみ|キャラクターグッズ|CHARACTER[_\s-]?GOODS/i.test(text)) return "character_goods";
  if (/\b(?:LP|VINYL)\b|レコード|アナログ盤|\brecord\b/i.test(text)) return "record";
  if (/\bCD\b|コンパクトディスク/i.test(text)) return "cd";
  if (/音楽ポスター|ツアーグッズ|コンサートグッズ|音楽関連グッズ|MUSIC[_\s-]?MEMORABILIA/i.test(text)) return "music_memorabilia";
  if (/(?:カメラ|スマートフォン|ヘッドホン|イヤホン|プレーヤー)\s*本体|電子機器本体|\bELECTRONICS\b/i.test(text)) return "electronics";
  return null;
}

export function inferProductType(category: ItemCategory, text: string, hasPokemonCard = false): ProductType {
  if (hasPokemonCard) return FAMILY_LABELS.trading_card;
  const family = inferProductTypeFamily(text);
  if (family) return FAMILY_LABELS[family];
  if (category === "Toys & Character Collectibles" && /TOY|玩具/i.test(text)) return FAMILY_LABELS.figure;
  return UNKNOWN_PRODUCT_TYPE;
}

export const STORE_DISCLAIMER =
  "候选区域和店铺根据商品类别与通常经营范围推荐，不代表实时库存；请在出发前自行确认店铺状态。";
