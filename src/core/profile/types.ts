export const COLLECTIBLE_CATEGORIES = [
  "Toys & Character Collectibles",
  "Cards & Game Collectibles",
  "Records & Music Collectibles",
] as const;

export type CollectibleCategory = (typeof COLLECTIBLE_CATEGORIES)[number];

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
  pokemonCard?: PokemonCardIdentity;
};

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

export function assertDetectionResult(value: unknown): asserts value is DetectionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The identification result must be a JSON object.");
  const object = value as Record<string, unknown>;
  const allowed = ["itemName", "version", "priceSearchKeywordJa", "category", "pokemonCard"];
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`The identification result contains extra fields: ${extras.join(", ")}`);
  for (const key of ["itemName", "version", "priceSearchKeywordJa"] as const) {
    if (typeof object[key] !== "string" || !object[key].trim()) throw new Error(`${key} must be a non-empty string.`);
  }
  if (!isCollectibleCategory(object.category)) throw new Error("The model could not reliably assign one of the three collectible categories.");
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
