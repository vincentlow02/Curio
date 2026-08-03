import type { PokemonCardIdentity } from "./types";

const UNKNOWN = /^unknown$/i;
const GRADING_PATTERN = /\b(PSA|BGS|CGC)\s*([0-9]+(?:\.[0-9]+)?)?\b/i;
const CARD_NUMBER_PATTERN = /(?:[A-Z0-9]{1,8}[_-])?\d{1,3}\/(?:[A-Z0-9-]{1,8}|\d{1,3})|NO\.?\s*\d{1,3}|\d{2,3}\/[A-Z]{1,5}-P/gi;
const RARITY_PATTERN = /\b(SAR|CSR|CHR|UR|HR|SR|AR|RRR|RR|R|U|C|MA|MUR)\b/gi;

function known(value: string): boolean {
  return Boolean(value.trim()) && !UNKNOWN.test(value.trim());
}

function normalizePokemonCardToken(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/\s+/g, "").replace(/／/g, "/");
}

function pokemonCardNumbers(value: string): string[] {
  return [...new Set((value.normalize("NFKC").match(CARD_NUMBER_PATTERN) ?? []).map(normalizePokemonCardToken))];
}

function explicitLanguageConflict(identity: PokemonCardIdentity, listing: string): boolean {
  if (identity.language === "Japanese") return /英語版|ENGLISH(?:\s+VERSION|\s+CARD)?/i.test(listing);
  if (identity.language === "English") return /日本語版|日本版|JAPANESE(?:\s+VERSION|\s+CARD)?/i.test(listing);
  return false;
}

function gradingMatches(identity: PokemonCardIdentity, listing: string): boolean {
  const listingGrade = listing.match(GRADING_PATTERN);
  if (identity.gradingCompany === "ungraded") return listingGrade === null;
  if (identity.gradingCompany === "unknown") return true;
  if (!listingGrade || listingGrade[1]?.toUpperCase() !== identity.gradingCompany) return false;
  return !known(identity.grade) || listingGrade[2] === identity.grade.trim();
}

function rarityConflicts(identity: PokemonCardIdentity, listing: string): boolean {
  if (!known(identity.rarity)) return false;
  const listingRarities = new Set((listing.match(RARITY_PATTERN) ?? []).map((value) => value.toUpperCase()));
  return listingRarities.size > 0 && !listingRarities.has(identity.rarity.trim().toUpperCase());
}

export type PokemonCardMatch = "exact" | "ambiguous" | "different";

export function matchPokemonCardIdentity(identity: PokemonCardIdentity, listing: string): PokemonCardMatch {
  const normalizedListing = normalizePokemonCardToken(listing);
  const normalizedName = normalizePokemonCardToken(identity.cardName);
  if (!known(identity.cardName) || !normalizedName || !normalizedListing.includes(normalizedName)) return "different";

  const targetNumber = pokemonCardNumbers(identity.cardNumber)[0] ?? normalizePokemonCardToken(identity.cardNumber);
  const listingNumbers = pokemonCardNumbers(listing);
  if (!known(identity.cardNumber) || !listingNumbers.length) return "ambiguous";
  if (!listingNumbers.includes(targetNumber)) return "different";

  if (explicitLanguageConflict(identity, listing)) return "different";
  if (!gradingMatches(identity, listing)) return "different";
  if (rarityConflicts(identity, listing)) return "different";

  const setCode = normalizePokemonCardToken(identity.setCode);
  if (known(identity.setCode)) {
    const listingSetCodes = [...new Set((listing.match(/\b(?:SV|SM|XY|BW|DP|S|M)\d{1,2}[A-Z]?\b/gi) ?? []).map(normalizePokemonCardToken))];
    if (listingSetCodes.length && !listingSetCodes.includes(setCode)) return "different";
  }
  return "exact";
}

export function buildPokemonCardSearchKeyword(identity: PokemonCardIdentity): string {
  const parts = [
    identity.cardName,
    identity.setCode,
    identity.cardNumber,
    identity.rarity,
    identity.language === "English" ? "英語版" : "",
    identity.gradingCompany !== "unknown" && identity.gradingCompany !== "ungraded"
      ? `${identity.gradingCompany}${known(identity.grade) ? identity.grade : ""}`
      : "",
    "ポケモンカード",
    "中古",
  ];
  return [...new Set(parts.map((value) => value.trim()).filter((value) => value && !UNKNOWN.test(value)))].join(" ");
}
