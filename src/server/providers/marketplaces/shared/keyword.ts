export function buildMarketplaceKeyword(keyword: string): string {
  return keyword
    .replace(/["“”「」『』]/g, " ")
    .replace(/五重奏団?/g, " ")
    .replace(/\b(?:QUINTET|ORCHESTRA)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}