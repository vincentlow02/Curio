import type { ItemProfile } from "../profile/types.js";

const GENERIC = new Set([
  "中古", "価格", "本体", "商品", "フィギュア", "ソフビ", "トイ", "TOY", "FIGURE",
  "レコード", "RECORD", "VINYL", "ALBUM", "CD", "LP",
  "ジャズ", "ヴィンテージ", "BLACK", "WHITE", "SILVER", "UNKNOWN",
]);

export function normalizeIdentity(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9一-龠ぁ-んァ-ヶ]/g, "");
}

function terms(values: string[]): string[] {
  const output = new Set<string>();
  for (const value of values) {
    for (const raw of value.normalize("NFKC").split(/[\s、,，・/／()（）「」『』【】]+/)) {
      const term = normalizeIdentity(raw);
      if (term.length >= 2 && !GENERIC.has(term)) output.add(term);
    }
  }
  return [...output];
}

function termCounts(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    for (const term of new Set(terms([value]))) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

export function identityMatches(profile: ItemProfile, text: string): boolean {
  const normalized = normalizeIdentity(text);
  if (!normalized) return false;
  const item = normalizeIdentity(profile.itemName);
  const brand = normalizeIdentity(profile.brandCharacterSeries);

  if (profile.subtype === "records_vinyl" || profile.subtype === "music_memorabilia") {
    const mediaContext = /中古|レコード|アナログ|VINYL|LP|CD|カセット|ALBUM|盤/i.test(text);
    return (brand.length >= 3 && normalized.includes(brand)) || (item.length >= 3 && normalized.includes(item) && mediaContext);
  }

  if (profile.subtype === "toys_character") {
    const brandTerms = terms([profile.brandCharacterSeries]);
    const allTerms = terms([profile.itemName, profile.brandCharacterSeries, ...profile.searchKeywordsJa]);
    const keywordCounts = termCounts(profile.searchKeywordsJa);
    const identityTerms = allTerms.filter((term) => brandTerms.includes(term) || (keywordCounts.get(term) ?? 0) >= 2);
    const descriptorTerms = allTerms.filter((term) => !identityTerms.some((identityTerm) => identityTerm.includes(term) || term.includes(identityTerm)));
    const hasIdentity = identityTerms.some((term) => normalized.includes(term)) || (brand.length >= 4 && normalized.includes(brand));
    const hasDescriptor = descriptorTerms.length === 0 || descriptorTerms.some((term) => normalized.includes(term));
    return hasIdentity && hasDescriptor;
  }

  const modelTerms = `${profile.itemName} ${profile.versionOrPeriod} ${profile.priceSearchKeywordJa}`
    .normalize("NFKC")
    .match(/[A-Za-z]{2,}[\s-]?\d{2,}/g)
    ?.map(normalizeIdentity) ?? [];
  if (modelTerms.length) return [...new Set(modelTerms)].every((term) => normalized.includes(term));

  const candidates = terms([profile.itemName, profile.brandCharacterSeries, ...profile.searchKeywordsJa]);
  return candidates.some((term) => normalized.includes(term));
}
