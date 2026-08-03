import { STORE_DISCLAIMER, type ItemProfile, type ItemSubtype } from "../../profile/types";
import type { DetectionResult } from "./types";

function subtypeFor(result: DetectionResult): ItemSubtype {
  if (result.category === "Toys & Character Collectibles") return "toys_character";
  if (result.category === "Records & Music Collectibles") return /ポスター|poster|memorabilia|グッズ/i.test(`${result.itemName} ${result.priceSearchKeywordJa}`) ? "music_memorabilia" : "records_vinyl";
  return /カード|card|pokemon|ポケモン|遊戯王|magic/i.test(`${result.itemName} ${result.priceSearchKeywordJa}`) ? "trading_cards" : "retro_games";
}

export function toLegacyItemProfile(result: DetectionResult): ItemProfile {
  return {
    itemName: result.itemName,
    brandCharacterSeries: "unknown",
    versionOrPeriod: result.version,
    color: "unknown",
    category: result.category,
    subtype: subtypeFor(result),
    searchKeywordsJa: [result.priceSearchKeywordJa, result.itemName, `${result.itemName} ${result.version}`],
    priceSearchKeywordJa: result.priceSearchKeywordJa,
    recommendedAreas: [],
    storeRecommendationDisclaimer: STORE_DISCLAIMER,
    notes: [],
    ...(result.pokemonCard ? { pokemonCard: result.pokemonCard } : {}),
  };
}
