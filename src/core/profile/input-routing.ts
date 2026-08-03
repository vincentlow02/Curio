const VAGUE_DESCRIPTIONS = new Set([
  "toy", "toys", "figure", "game", "card", "record", "cd", "collectible", "something", "this",
  "玩具", "手办", "公仔", "游戏", "卡牌", "唱片", "这个", "不知道", "收藏品",
  "おもちゃ", "フィギュア", "ゲーム", "カード", "レコード", "これ", "わからない",
]);

export function isSpecificDescription(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[,.!?，。！？]/g, " ").replace(/\s+/g, " ");
  if (!normalized || VAGUE_DESCRIPTIONS.has(normalized)) return false;
  if (/\d/.test(normalized)) return true;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length >= 2 && words.some((word) => !VAGUE_DESCRIPTIONS.has(word))) return true;
  return normalized.length >= 8;
}
