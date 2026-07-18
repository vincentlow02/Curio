export const COLLECTIBLE_CATEGORIES = [
  "Toys & Character Collectibles",
  "Cards & Game Collectibles",
  "Records & Music Collectibles",
] as const;

export type CollectibleCategory = (typeof COLLECTIBLE_CATEGORIES)[number];

export type DetectionResult = {
  itemName: string;
  version: string;
  priceSearchKeywordJa: string;
  category: CollectibleCategory;
};

export type DetectionOutcome =
  | { status: "identified"; result: DetectionResult }
  | { status: "needs_review"; reason: string };

export function detectionReviewReason(result: DetectionResult): string | null {
  const name = result.itemName.trim();
  if (!name || /^unknown$/i.test(name)) return "The item name could not be confirmed reliably.";
  if (!result.priceSearchKeywordJa.trim() || /^unknown$/i.test(result.priceSearchKeywordJa.trim())) return "A reliable Japanese price-search keyword could not be generated.";

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
  const allowed = ["itemName", "version", "priceSearchKeywordJa", "category"];
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`The identification result contains extra fields: ${extras.join(", ")}`);
  for (const key of ["itemName", "version", "priceSearchKeywordJa"] as const) {
    if (typeof object[key] !== "string" || !object[key].trim()) throw new Error(`${key} must be a non-empty string.`);
  }
  if (!isCollectibleCategory(object.category)) throw new Error("The model could not reliably assign one of the three collectible categories.");
}
