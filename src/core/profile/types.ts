export const COLLECTIBLE_CATEGORIES = [
  "Toys & Character Collectibles",
  "Cards & Game Collectibles",
  "Records & Music Collectibles",
] as const;

export type CollectibleCategory = (typeof COLLECTIBLE_CATEGORIES)[number];

export const UNKNOWN_PRODUCT_TYPE = "不明";
export const MAX_PRODUCT_TYPE_LENGTH = 40;

/**
 * A short, user-editable Japanese description of the actual traded object.
 * Legacy English values remain valid because saved analyses may still contain them.
 */
export type ProductType = string;

export function normalizeProductType(value: string): ProductType {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function isUnknownProductType(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^(?:不明|未確認|unknown|other)$/i.test(normalizeProductType(value));
}

export type PokemonCardIdentity = {
  cardName: string;
  cardNumber: string;
  setCode: string;
  setName: string;
  rarity: string;
  language: "Japanese" | "English" | "unknown";
  edition: string;
  gradingCompany: "PSA" | "BGS" | "CGC" | "ungraded" | "unknown";
  grade: string;
};

export type DetectionResult = {
  itemName: string;
  version: string;
  priceSearchKeywordJa: string;
  category: CollectibleCategory;
  productType?: ProductType;
  pokemonCard?: PokemonCardIdentity;
};

/** User-confirmed identity; the search keyword is owned by the server. */
export type ConfirmedIdentity = Omit<DetectionResult, "priceSearchKeywordJa">;

export function assertConfirmedIdentity(value: unknown): asserts value is ConfirmedIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The confirmed identity must be an object.");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !["itemName", "version", "productType", "category", "pokemonCard"].includes(key))) {
    throw new Error("The confirmed identity contains unsupported fields.");
  }
  assertDetectionResult({ ...object, priceSearchKeywordJa: "server-owned" });
  for (const key of ["itemName", "version"] as const) {
    const text = object[key] as string;
    if ([...text].length > 200 || /[\u0000-\u001f\u007f]/u.test(text)) throw new Error(`${key} is invalid.`);
  }
  if (object.pokemonCard) {
    const card = object.pokemonCard as Record<string, string>;
    if (Object.values(card).some((text) => [...text].length > 100 || /[\u0000-\u001f\u007f]/u.test(text))) {
      throw new Error("The Pokémon card identity is invalid.");
    }
  }
}

export type DetectionOutcome =
  | { status: "identified"; result: DetectionResult }
  | { status: "needs_review"; reason: string };

export function detectionReviewReason(result: DetectionResult): string | null {
  const name = result.itemName.trim();
  if (!name || /^unknown$/i.test(name)) return "The item name could not be confirmed reliably.";
  if (!result.priceSearchKeywordJa.trim() || /^unknown$/i.test(result.priceSearchKeywordJa.trim())) return "A reliable Japanese price-search keyword could not be generated.";
  if (result.pokemonCard && (!result.pokemonCard.cardNumber.trim() || /^unknown$/i.test(result.pokemonCard.cardNumber.trim()))) {
    return "The Pokémon card number could not be confirmed. Upload a clear image of the complete card front.";
  }

  // A lone word on a record cover is commonly a title fragment, label, or
  // decorative text. A useful marketplace identity needs an artist/brand plus
  // the release or memorabilia name, so do not search from that fragment.
  if (result.category === "Records & Music Collectibles" && /^[\p{L}]+$/u.test(name) && name.length <= 24) {
    return "Only one isolated word was visible, so the artist, brand or complete title could not be confirmed.";
  }
  return null;
}

export function isCollectibleCategory(value: unknown): value is CollectibleCategory {
  return typeof value === "string" && (COLLECTIBLE_CATEGORIES as readonly string[]).includes(value);
}

export function isProductType(value: unknown): value is ProductType {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  const normalized = normalizeProductType(value);
  return normalized.length > 0 && [...normalized].length <= MAX_PRODUCT_TYPE_LENGTH;
}

export function assertDetectionResult(value: unknown): asserts value is DetectionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The identification result must be a JSON object.");
  const object = value as Record<string, unknown>;
  const allowed = ["itemName", "version", "priceSearchKeywordJa", "category", "productType", "pokemonCard"];
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`The identification result contains extra fields: ${extras.join(", ")}`);
  for (const key of ["itemName", "version", "priceSearchKeywordJa"] as const) {
    if (typeof object[key] !== "string" || !object[key].trim()) throw new Error(`${key} must be a non-empty string.`);
  }
  if (!isCollectibleCategory(object.category)) throw new Error("The model could not reliably assign one of the three collectible categories.");
  if (object.productType !== undefined && !isProductType(object.productType)) throw new Error("productType is invalid.");
  if (object.pokemonCard !== undefined) {
    if (object.category !== "Cards & Game Collectibles") throw new Error("pokemonCard is only valid for Cards & Game Collectibles.");
    if (!object.pokemonCard || typeof object.pokemonCard !== "object" || Array.isArray(object.pokemonCard)) throw new Error("pokemonCard must be an object.");
    const card = object.pokemonCard as Record<string, unknown>;
    const cardKeys = ["cardName", "cardNumber", "setCode", "setName", "rarity", "language", "edition", "gradingCompany", "grade"];
    const cardExtras = Object.keys(card).filter((key) => !cardKeys.includes(key));
    if (cardExtras.length) throw new Error(`pokemonCard contains extra fields: ${cardExtras.join(", ")}`);
    for (const key of ["cardName", "cardNumber", "setCode", "setName", "rarity", "edition", "grade"] as const) {
      if (typeof card[key] !== "string" || !card[key].trim()) throw new Error(`pokemonCard.${key} must be a non-empty string.`);
    }
    if (!["Japanese", "English", "unknown"].includes(String(card.language))) throw new Error("pokemonCard.language is invalid.");
    if (!["PSA", "BGS", "CGC", "ungraded", "unknown"].includes(String(card.gradingCompany))) throw new Error("pokemonCard.gradingCompany is invalid.");
  }
}
