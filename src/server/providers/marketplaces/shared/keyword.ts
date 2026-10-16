import type { ItemProfile } from "../../../../price/item-profile";

export function buildMarketplaceKeyword(keyword: string): string {
  return keyword
    .replace(/["“”「」『』]/g, " ")
    .replace(/五重奏団?/g, " ")
    .replace(/\b(?:QUINTET|ORCHESTRA)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMarketplaceKeywordForProfile(profile: Pick<ItemProfile, "priceSearchKeywordJa">): string {
  return buildMarketplaceKeyword(profile.priceSearchKeywordJa);
}
