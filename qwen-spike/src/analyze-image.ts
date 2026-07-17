import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import OpenAI from "openai";

import {
  ITEM_CATEGORIES,
  ITEM_SUBTYPES,
  STORE_DISCLAIMER,
  type ItemProfile,
} from "./profile/types.js";

type QwenConfig = { apiKey: string; baseURL: string; model: string };

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV_PATH = resolve(PROJECT_ROOT, ".env.local");
const OUTPUT_PATH = resolve(PROJECT_ROOT, "output", "item-profile.json");
const COST_PATH = resolve(PROJECT_ROOT, "output", "item-profile-cost.json");
const CACHE_ROOT = resolve(PROJECT_ROOT, ".cache", "identification");
const PROMPT_VERSION = "identification-v4-area-only";
const FORBIDDEN_INVENTORY = /当前有货|现货|库存充足|一定可以买到|已确认有该商品|available now|in stock/i;

const MODEL_PROMPT = `
分析图片中的收藏品，只返回 JSON，不要解释，不要 Markdown。

严格返回以下字段，不得增加额外字段：
{
  "itemName": "string or unknown",
  "brandCharacterSeries": "string or unknown",
  "versionOrPeriod": "string or unknown",
  "color": "string or unknown",
  "category": "Toys & Character Collectibles | Cards & Game Collectibles | Records & Music Collectibles | unknown",
  "subtype": "toys_character | trading_cards | retro_games | records_vinyl | music_memorabilia | unknown",
  "searchKeywordsJa": ["3 to 6 Japanese marketplace search keywords"],
  "priceSearchKeywordJa": "one precise Japanese keyword phrase for Rakuten asking-price search",
  "recommendedAreas": [
    {
      "area": "compact Tokyo shopping area name",
      "reason": "why stores in this area commonly handle this collectible type",
      "storeSearchKeywordJa": "area + collectible category + 中古 + 店舗"
    }
  ],
  "storeRecommendationDisclaimer": "${STORE_DISCLAIMER}",
  "notes": ["short uncertainty notes"]
}

识别规则：
- 不确定的信息必须写 unknown，不得捏造型号、年份、版本或颜色。
- 优先读取品牌、Logo、角色名、型号、编号和包装文字。
- searchKeywordsJa 必须有 3–6 条，适合日本二手市场搜索。
- priceSearchKeywordJa 只保留商品名、品牌、明确型号/版本和「中古」；不要加入「東京」「店舗」「専門店」。
- category/subtype 必须根据 PRIMARY COLLECTIBLE TYPE 分类，而不是外观。
- 游戏主机、掌机、游戏软件、卡带及游戏硬件必须属于 Cards & Game Collectibles；游戏软硬件 subtype 为 retro_games，集换式卡牌为 trading_cards。
- 玩具、手办、ソフビ、角色周边 subtype 为 toys_character。
- 黑胶、CD、磁带 subtype 为 records_vinyl；音乐海报、演唱会周边和音乐纪念品为 music_memorabilia。
- 无法可靠判断时 category 和 subtype 都返回 unknown。

区域和店铺推荐规则：
- 根据收藏品类别推荐用户值得前往寻找该类商品的区域与候选店，不确认实时库存。
- 最多 2 个紧凑区域；每个区域提供一条类别风格的店铺搜索词。
- 不得推荐整个东京等过大范围，不得输出任何具体店名、地址、营业时间、库存或商品在售断言。
- storeSearchKeywordJa 例如「秋葉原 中古 レトロゲーム 店舗」，不得包含具体商品型号。
- storeRecommendationDisclaimer 必须逐字使用给定内容。
- 不得出现「当前有货」「现货」「库存充足」「一定可以买到」「已确认有该商品」「available now」「in stock」。
- notes 没有不确定信息时返回空数组。

只返回 JSON。
`.trim();

class AppError extends Error {
  constructor(message: string) { super(message); this.name = "AppError"; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCli(): { imagePath: string; refresh: boolean } {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const paths = args.filter((arg) => arg !== "--refresh");
  if (paths.length !== 1) throw new AppError("用法：npm run analyze -- ./test-data/sample-item.jpg [--refresh]");
  return { imagePath: resolve(process.cwd(), paths[0]!), refresh };
}

async function loadImage(imagePath: string): Promise<{ dataUrl: string; bytes: Buffer }> {
  let info;
  try { info = await stat(imagePath); } catch { throw new AppError(`图片不存在：${imagePath}`); }
  if (!info.isFile()) throw new AppError(`图片路径不是文件：${imagePath}`);
  const extension = extname(imagePath).toLowerCase();
  const mime = MIME_TYPES[extension];
  if (!mime) throw new AppError(`图片格式不支持：${extension || "无扩展名"}。仅支持 jpg、jpeg、png、webp。`);
  const buffer = await readFile(imagePath);
  return { dataUrl: `data:${mime};base64,${buffer.toString("base64")}`, bytes: buffer };
}

async function loadConfig(): Promise<QwenConfig> {
  const result = dotenv.config({ path: ENV_PATH, override: true, quiet: true });
  if (result.error) throw new AppError(`读取 .env.local 失败：${result.error.message}`);
  const names = ["QWEN_API_KEY", "QWEN_BASE_URL", "QWEN_VISION_MODEL"] as const;
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new AppError(`.env.local 缺少必填环境变量：${missing.join(", ")}`);
  return {
    apiKey: process.env.QWEN_API_KEY!.trim(),
    baseURL: process.env.QWEN_BASE_URL!.trim().replace(/\/$/, ""),
    model: process.env.QWEN_VISION_MODEL!.trim(),
  };
}

function stripFence(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  return (trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed).trim();
}

function nonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new AppError(`模型 JSON 字段 ${field} 必须是非空字符串。`);
}

function stringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new AppError(`模型 JSON 字段 ${field} 必须是非空字符串数组。`);
  }
}

function validateProfile(value: unknown): ItemProfile {
  if (!isRecord(value)) throw new AppError("模型返回的 JSON 顶层必须是对象。");
  const fields = ["itemName", "brandCharacterSeries", "versionOrPeriod", "color", "category", "subtype", "searchKeywordsJa", "priceSearchKeywordJa", "recommendedAreas", "storeRecommendationDisclaimer", "notes"];
  const missing = fields.filter((field) => !(field in value));
  const extra = Object.keys(value).filter((field) => !fields.includes(field));
  if (missing.length) throw new AppError(`模型 JSON 缺少字段：${missing.join(", ")}`);
  if (extra.length) throw new AppError(`模型 JSON 包含额外字段：${extra.join(", ")}`);
  for (const field of ["itemName", "brandCharacterSeries", "versionOrPeriod", "color", "priceSearchKeywordJa"] as const) nonEmptyString(value[field], field);
  if (typeof value.category !== "string" || !(ITEM_CATEGORIES as readonly string[]).includes(value.category)) throw new AppError("category 不是允许值。");
  if (typeof value.subtype !== "string" || !(ITEM_SUBTYPES as readonly string[]).includes(value.subtype)) throw new AppError("subtype 不是允许值。");
  stringArray(value.searchKeywordsJa, "searchKeywordsJa");
  if (value.searchKeywordsJa.length < 3 || value.searchKeywordsJa.length > 6) throw new AppError("searchKeywordsJa 必须包含 3–6 条关键词。");
  stringArray(value.notes, "notes");
  if (value.storeRecommendationDisclaimer !== STORE_DISCLAIMER) throw new AppError("storeRecommendationDisclaimer 不符合固定安全文案。");
  if (!Array.isArray(value.recommendedAreas) || value.recommendedAreas.length > 2) throw new AppError("recommendedAreas 最多包含 2 个区域。");
  for (const [areaIndex, area] of value.recommendedAreas.entries()) {
    if (!isRecord(area)) throw new AppError(`recommendedAreas[${areaIndex}] 必须是对象。`);
    nonEmptyString(area.area, `recommendedAreas[${areaIndex}].area`);
    nonEmptyString(area.reason, `recommendedAreas[${areaIndex}].reason`);
    nonEmptyString(area.storeSearchKeywordJa, `recommendedAreas[${areaIndex}].storeSearchKeywordJa`);
    if (Object.keys(area).some((field) => !["area", "reason", "storeSearchKeywordJa"].includes(field))) throw new AppError("recommendedAreas 不允许包含具体店铺字段。");
  }
  if (FORBIDDEN_INVENTORY.test(JSON.stringify(value))) throw new AppError("模型结果包含不允许的实时库存声明。");
  return value as ItemProfile;
}

async function analyze(dataUrl: string, config: QwenConfig): Promise<{
  profile: ItemProfile;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: 120_000, maxRetries: 0 });
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: [{ type: "text", text: MODEL_PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 500,
    });
  } catch (error) {
    const status = error instanceof OpenAI.APIError && error.status ? `HTTP ${error.status}：` : "";
    throw new AppError(`Qwen API 调用失败：${status}${error instanceof Error ? error.message : String(error)}`);
  }
  const text = completion.choices[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AppError("Qwen API 响应中没有可用文本。");
  try {
    return {
      profile: validateProfile(JSON.parse(stripFence(text)) as unknown),
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
    };
  }
  catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`模型没有返回合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const cli = getCli();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const [image, config] = await Promise.all([loadImage(cli.imagePath), loadConfig()]);
  const cacheKey = createHash("sha256").update(image.bytes).update(config.model).update(PROMPT_VERSION).digest("hex");
  const cachePath = resolve(CACHE_ROOT, `${cacheKey}.json`);
  let analyzed: Awaited<ReturnType<typeof analyze>>;
  let cacheHit = false;
  if (!cli.refresh) {
    try {
      analyzed = { profile: validateProfile(JSON.parse(await readFile(cachePath, "utf8")) as unknown), usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
      cacheHit = true;
    } catch {
      analyzed = await analyze(image.dataUrl, config);
    }
  } else {
    analyzed = await analyze(image.dataUrl, config);
  }
  const completed = Date.now();
  await Promise.all([mkdir(resolve(PROJECT_ROOT, "output"), { recursive: true }), mkdir(CACHE_ROOT, { recursive: true })]);
  const json = `${JSON.stringify(analyzed.profile, null, 2)}\n`;
  const cost = {
    model: config.model,
    promptVersion: PROMPT_VERSION,
    cacheKey,
    cacheHit,
    refresh: cli.refresh,
    qwenCalls: cacheHit ? 0 : 1,
    ...analyzed.usage,
    startedAt,
    completedAt: new Date(completed).toISOString(),
    totalMs: completed - started,
  };
  await Promise.all([
    writeFile(OUTPUT_PATH, json, "utf8"),
    writeFile(COST_PATH, `${JSON.stringify(cost, null, 2)}\n`, "utf8"),
    cacheHit ? Promise.resolve() : writeFile(cachePath, json, "utf8"),
  ]);
  process.stdout.write(json);
  console.error(`结果已保存到：${OUTPUT_PATH}`);
  console.error(`Token/耗时记录已保存到：${COST_PATH}`);
}

main().catch((error: unknown) => {
  console.error(`错误：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
