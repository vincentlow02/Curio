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

export function isCollectibleCategory(value: unknown): value is CollectibleCategory {
  return typeof value === "string" && (COLLECTIBLE_CATEGORIES as readonly string[]).includes(value);
}

export function assertDetectionResult(value: unknown): asserts value is DetectionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("识别结果必须是 JSON 对象。");
  const object = value as Record<string, unknown>;
  const allowed = ["itemName", "version", "priceSearchKeywordJa", "category"];
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`识别结果包含额外字段：${extras.join(", ")}`);
  for (const key of ["itemName", "version", "priceSearchKeywordJa"] as const) {
    if (typeof object[key] !== "string" || !object[key].trim()) throw new Error(`${key} 必须是非空字符串。`);
  }
  if (!isCollectibleCategory(object.category)) throw new Error("模型无法可靠归入三个收藏品类别。");
}
