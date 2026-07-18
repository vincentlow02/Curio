import "server-only";
import OpenAI from "openai";
import type { CollectorEvidence } from "../../../core/analysis/types";
import { assertDetectionResult, detectionReviewReason, type CollectibleCategory, type DetectionOutcome } from "../../../core/profile/types";
import { env, assertLiveConfiguration } from "../../config/env";

const OUTPUT_RULES = `你的任务是识别可用于日本二手市场搜索的“完整商品身份”，不是简单抄写图片中最大的文字。

在输出 JSON 前，必须在内部完成以下自检，但不要输出推理过程：
1. 先判断图片中的实体是什么：玩具/角色商品、卡牌/游戏软硬件、唱片/CD/磁带/音乐纪念品。
2. 阅读整个物体、包装正反面、书脊、标签和 Logo；优先寻找品牌、制造商、艺术家、角色、系列、型号、目录编号和平台。
3. 将视觉外形与文字交叉验证。封面上最大的一个单词可能只是标题片段、装饰文字或系列文字，不能单独当成完整商品名。
4. 生成规范 itemName：
   - 玩具：品牌/制造商 + 产品线 + 角色或作品；例如 MEDICOM TOY BE@RBRICK Astro Boy。
   - 卡牌/游戏：品牌或平台 + 商品/游戏名称 + 明确型号；例如 Sony PSP-3000。
   - 音乐：艺术家 + 专辑/作品名称 + 介质；例如 山下達郎 FOR YOU LP。音乐海报或周边也要包含艺术家。
5. 如果只能确认一个含义不明确的单词，或无法把文字与具体品牌/艺术家/角色/型号对应，itemName 必须写 unknown。
6. 不得根据风格、颜色或常识猜测图片中看不到的品牌、年份、型号、艺术家或版本。

只返回 JSON，不要解释，不要 Markdown。
只允许返回：
{"itemName":"string","version":"string or unknown","priceSearchKeywordJa":"one precise Japanese marketplace keyword","category":"Toys & Character Collectibles | Cards & Game Collectibles | Records & Music Collectibles | unknown"}

分类按 PRIMARY COLLECTIBLE TYPE：
- Toys & Character Collectibles：designer toys、手办、ソフビ、角色周边。
- Cards & Game Collectibles：交易卡、复古游戏、掌机、主机、游戏软件、限定游戏硬件。任何游戏硬件必须属于此类。
- Records & Music Collectibles：黑胶、CD、磁带、海报、音乐纪念品。

不确定 itemName/version 时写 unknown，不得捏造。无法可靠归类时 category 写 unknown。
itemName 不要添加引号，不要只返回包装上的一个孤立单词。
itemName 必须使用日本二手市场常用的日语商品名称。品牌、型号和正式英文产品线可以保留原文，但人物、作品和通用商品类别优先使用日语；例如「ソニー PSP-3000」「メディコム・トイ 鉄腕アトム BE@RBRICK」「山下達郎 FOR YOU LP」。不要输出中文翻译名称。
priceSearchKeywordJa 必须基于已确认的 itemName，选择 2 到 4 个最有区分力的身份锚点，再加入明确型号/介质和「中古」。不要机械复制冗长完整名称，不要加入东京、店铺或专门店。音乐类优先使用“艺术家 + 作品名 + LP/CD + 中古”，可省略「五重奏」「五重奏団」等不影响身份的通用编制词。itemName 为 unknown 时，priceSearchKeywordJa 也写 unknown。`;

const IMAGE_PROMPT = `分析图片中的收藏品。${OUTPUT_RULES}`;
const TEXT_PROMPT = `根据用户提供的文字识别收藏品。不要补造文字中没有出现的具体版本、年份或型号。${OUTPUT_RULES}`;

function stripFence(text: string): string {
  const clean = text.trim();
  return (clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? clean).trim();
}

const COLLECTOR_RULES = `

Collector Mode is enabled. Keep the four identification fields and add exactly one field named collectorEvidence:
{"editionSignals":["visible edition or release evidence"],"conditionSignals":["visible condition evidence"],"visibleIdentifiers":["visible model, catalog, serial, signature or package identifiers"],"missingEvidence":["important collector evidence that cannot be confirmed"]}
Only record evidence visible in the image or explicitly stated by the user. Never infer authenticity, hidden damage, completeness, rarity, grade, year, packaging or accessories that are not visible. All collectorEvidence strings must be written in English. Use empty arrays when there is no positive evidence. Put unconfirmable collector facts in missingEvidence. Return only the combined JSON object.`;

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}

function categoryConstraint(selectedCategory?: CollectibleCategory | null): string {
  return selectedCategory
    ? `\n\n用户已固定分类为：${selectedCategory}\n只在该分类范围内识别商品。category 必须原样返回该值。如果图片明显不属于该分类，仍保留该 category，但 itemName、version 和 priceSearchKeywordJa 写 unknown，让系统请求用户确认；不要为了符合分类而捏造商品。`
    : "";
}

function trimWrappingQuotes(value: string): string {
  return value.trim().replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/gu, "").trim();
}

function parseOutcome(text: string, selectedCategory?: CollectibleCategory | null): DetectionOutcome {
  let parsed: unknown;
  try { parsed = JSON.parse(stripFence(text)); } catch { throw new Error("Qwen did not return valid JSON."); }
  if (selectedCategory && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    (parsed as Record<string, unknown>).category = selectedCategory;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const object = parsed as Record<string, unknown>;
    if (typeof object.itemName === "string") object.itemName = trimWrappingQuotes(object.itemName);
    if (typeof object.version === "string") object.version = trimWrappingQuotes(object.version) || "unknown";
    if (typeof object.priceSearchKeywordJa === "string") object.priceSearchKeywordJa = trimWrappingQuotes(object.priceSearchKeywordJa);
  }
  if (parsed && typeof parsed === "object" && (parsed as { category?: unknown }).category === "unknown") {
    return { status: "needs_review", reason: "The collectible category could not be identified reliably. Provide a clearer brand, package or model reference." };
  }
  try { assertDetectionResult(parsed); }
  catch { return { status: "needs_review", reason: "The item name, version or category could not be identified reliably. Add more specific information." }; }
  const reviewReason = detectionReviewReason(parsed);
  if (reviewReason) return { status: "needs_review", reason: reviewReason };
  return { status: "identified", result: parsed };
}

function parseCollectorResponse(text: string, selectedCategory: CollectibleCategory | null | undefined, collectorMode: boolean): { outcome: DetectionOutcome; collectorEvidence: CollectorEvidence | null } {
  if (!collectorMode) return { outcome: parseOutcome(text, selectedCategory), collectorEvidence: null };
  let parsed: unknown;
  try { parsed = JSON.parse(stripFence(text)); } catch { return { outcome: parseOutcome(text, selectedCategory), collectorEvidence: null }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { outcome: parseOutcome(text, selectedCategory), collectorEvidence: null };
  const object = parsed as Record<string, unknown>;
  const raw = object.collectorEvidence;
  const evidence = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const collectorEvidence: CollectorEvidence = {
    editionSignals: stringArray(evidence.editionSignals),
    conditionSignals: stringArray(evidence.conditionSignals),
    visibleIdentifiers: stringArray(evidence.visibleIdentifiers),
    missingEvidence: stringArray(evidence.missingEvidence),
  };
  delete object.collectorEvidence;
  return { outcome: parseOutcome(JSON.stringify(object), selectedCategory), collectorEvidence };
}

export async function detectCollectible(dataUrl: string, selectedCategory?: CollectibleCategory | null, textHint = "", collectorMode = false): Promise<{ outcome: DetectionOutcome; collectorEvidence: CollectorEvidence | null; usage: { inputTokens: number; outputTokens: number } }> {
  assertLiveConfiguration("image");
  const client = new OpenAI({ apiKey: env.qwenApiKey, baseURL: env.qwenBaseUrl, timeout: 60_000, maxRetries: 0 });
  const hint = textHint.trim() ? `\n\n用户补充描述：${textHint.trim()}` : "";
  const response = await client.chat.completions.create({
    model: env.qwenVisionModel,
    messages: [{ role: "user", content: [{ type: "text", text: `${IMAGE_PROMPT}${hint}${categoryConstraint(selectedCategory)}${collectorMode ? COLLECTOR_RULES : ""}` }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: collectorMode ? 650 : 300,
  });
  const usage = { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 };
  const text = response.choices[0]?.message.content;
  if (!text) throw new Error("Qwen returned no identification text.");
  return { ...parseCollectorResponse(text, selectedCategory, collectorMode), usage };
}

export async function detectTextCollectible(input: string, selectedCategory?: CollectibleCategory | null, collectorMode = false): Promise<{ outcome: DetectionOutcome; collectorEvidence: CollectorEvidence | null; usage: { inputTokens: number; outputTokens: number } }> {
  assertLiveConfiguration("text");
  const client = new OpenAI({ apiKey: env.qwenApiKey, baseURL: env.qwenBaseUrl, timeout: 45_000, maxRetries: 0 });
  const response = await client.chat.completions.create({
    model: env.qwenTextModel,
    messages: [{ role: "user", content: `${TEXT_PROMPT}${categoryConstraint(selectedCategory)}${collectorMode ? COLLECTOR_RULES : ""}\n\n用户文字：${input.trim()}` }],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: collectorMode ? 650 : 300,
  });
  const usage = { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 };
  const text = response.choices[0]?.message.content;
  if (!text) throw new Error("Qwen returned no text-identification result.");
  return { ...parseCollectorResponse(text, selectedCategory, collectorMode), usage };
}
