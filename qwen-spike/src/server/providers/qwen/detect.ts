import "server-only";
import OpenAI from "openai";
import { assertDetectionResult, type DetectionOutcome } from "../../../core/profile/types";
import { env, assertLiveConfiguration } from "../../config/env";

const PROMPT = `分析图片中的收藏品，只返回 JSON，不要解释，不要 Markdown。
只允许返回：
{"itemName":"string","version":"string or unknown","priceSearchKeywordJa":"one precise Japanese marketplace keyword","category":"Toys & Character Collectibles | Cards & Game Collectibles | Records & Music Collectibles | unknown"}

分类按 PRIMARY COLLECTIBLE TYPE：
- Toys & Character Collectibles：designer toys、手办、ソフビ、角色周边。
- Cards & Game Collectibles：交易卡、复古游戏、掌机、主机、游戏软件、限定游戏硬件。任何游戏硬件必须属于此类。
- Records & Music Collectibles：黑胶、CD、磁带、海报、音乐纪念品。

不确定 itemName/version 时写 unknown，不得捏造。无法可靠归类时 category 写 unknown。
priceSearchKeywordJa 只包含商品名、明确型号/版本和「中古」，不要加入东京、店铺或专门店。`;

function stripFence(text: string): string {
  const clean = text.trim();
  return (clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? clean).trim();
}

export async function detectCollectible(dataUrl: string): Promise<{ outcome: DetectionOutcome; usage: { inputTokens: number; outputTokens: number } }> {
  assertLiveConfiguration();
  const client = new OpenAI({ apiKey: env.qwenApiKey, baseURL: env.qwenBaseUrl, timeout: 60_000, maxRetries: 0 });
  const response = await client.chat.completions.create({
    model: env.qwenVisionModel,
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 300,
  });
  const usage = { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 };
  const text = response.choices[0]?.message.content;
  if (!text) throw new Error("Qwen 没有返回识别文本。");
  let parsed: unknown;
  try { parsed = JSON.parse(stripFence(text)); } catch { throw new Error("Qwen 没有返回合法 JSON。"); }
  if (parsed && typeof parsed === "object" && (parsed as { category?: unknown }).category === "unknown") {
    return { outcome: { status: "needs_review", reason: "无法可靠判断收藏品类别，请换一张包装或型号更清晰的图片。" }, usage };
  }
  try { assertDetectionResult(parsed); }
  catch { return { outcome: { status: "needs_review", reason: "无法可靠识别商品名称、版本或类别，请换一张更清晰的图片。" }, usage }; }
  return { outcome: { status: "identified", result: parsed }, usage };
}
