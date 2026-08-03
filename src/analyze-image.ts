import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI from "openai";
import { assertDetectionResult, type DetectionResult } from "./core/profile/types";

type QwenConfig = { apiKey: string; baseURL: string; model: string };
const MIME_TYPES: Readonly<Record<string, string>> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT_PATH = resolve(PROJECT_ROOT, "output", "item-profile.json");
const COST_PATH = resolve(PROJECT_ROOT, "output", "item-profile-cost.json");
const CACHE_ROOT = resolve(PROJECT_ROOT, ".cache", "identification");
const PROMPT_VERSION = "detection-four-fields-v1";

const PROMPT = `分析图片中的收藏品，只返回 JSON，不要解释，不要 Markdown。
只允许返回以下四个字段，不得增加字段：
{
  "itemName": "string or unknown",
  "version": "string or unknown",
  "priceSearchKeywordJa": "one precise Japanese marketplace price-search phrase",
  "category": "Toys & Character Collectibles | Cards & Game Collectibles | Records & Music Collectibles | unknown"
}

分类必须按 PRIMARY COLLECTIBLE TYPE：
- Toys & Character Collectibles：designer toys、手办、ソフビ、角色周边。
- Cards & Game Collectibles：交易卡、复古游戏、掌机、主机、游戏软件、限定游戏硬件。任何游戏硬件必须属于此类。
- Records & Music Collectibles：黑胶、CD、磁带、海报、音乐纪念品。

优先读取 Logo、商品名、型号、编号和包装文字。不确定的名称或版本写 unknown，不得捏造。
priceSearchKeywordJa 只保留商品名称、明确型号或版本和「中古」，不得加入东京、店铺或专门店。
无法可靠分类时 category 返回 unknown。只返回 JSON。`;

class AppError extends Error { constructor(message: string) { super(message); this.name = "AppError"; } }

function cli(): { imagePath: string; refresh: boolean } {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const paths = args.filter((arg) => arg !== "--refresh");
  if (paths.length !== 1) throw new AppError("用法：npm run analyze -- ./test-data/sample-item.jpg [--refresh]");
  return { imagePath: resolve(process.cwd(), paths[0]!), refresh };
}

async function imageData(imagePath: string): Promise<{ dataUrl: string; bytes: Buffer }> {
  let info;
  try { info = await stat(imagePath); } catch { throw new AppError(`图片不存在：${imagePath}`); }
  if (!info.isFile()) throw new AppError(`图片路径不是文件：${imagePath}`);
  const extension = extname(imagePath).toLowerCase();
  const mime = MIME_TYPES[extension];
  if (!mime) throw new AppError(`图片格式不支持：${extension || "无扩展名"}。仅支持 jpg、jpeg、png、webp。`);
  const bytes = await readFile(imagePath);
  return { dataUrl: `data:${mime};base64,${bytes.toString("base64")}`, bytes };
}

function config(): QwenConfig {
  const result = dotenv.config({ path: resolve(PROJECT_ROOT, ".env.local"), override: true, quiet: true });
  if (result.error) throw new AppError(`读取 .env.local 失败：${result.error.message}`);
  const missing = ["QWEN_API_KEY", "QWEN_BASE_URL", "QWEN_VISION_MODEL"].filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new AppError(`.env.local 缺少必填环境变量：${missing.join(", ")}`);
  return { apiKey: process.env.QWEN_API_KEY!.trim(), baseURL: process.env.QWEN_BASE_URL!.trim().replace(/\/$/, ""), model: process.env.QWEN_VISION_MODEL!.trim() };
}

function stripFence(text: string): string { const clean = text.replace(/^\uFEFF/, "").trim(); return (clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? clean).trim(); }

function parseDetection(text: string): DetectionResult {
  let parsed: unknown;
  try { parsed = JSON.parse(stripFence(text)); } catch (error) { throw new AppError(`模型没有返回合法 JSON：${error instanceof Error ? error.message : String(error)}`); }
  if (parsed && typeof parsed === "object" && (parsed as { category?: unknown }).category === "unknown") throw new AppError("needs_review：无法可靠判断收藏品类别，请换一张包装或型号更清晰的图片。");
  try { assertDetectionResult(parsed); } catch (error) { throw new AppError(`模型 JSON 验证失败：${error instanceof Error ? error.message : String(error)}`); }
  return parsed;
}

async function detect(dataUrl: string, options: QwenConfig): Promise<{ result: DetectionResult; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL, timeout: 120_000, maxRetries: 0 });
  let response;
  try {
    response = await client.chat.completions.create({ model: options.model, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }], response_format: { type: "json_object" }, temperature: 0, max_tokens: 300 });
  } catch (error) {
    const status = error instanceof OpenAI.APIError && error.status ? `HTTP ${error.status}：` : "";
    throw new AppError(`Qwen API 调用失败：${status}${error instanceof Error ? error.message : String(error)}`);
  }
  const text = response.choices[0]?.message.content;
  if (!text) throw new AppError("Qwen API 响应中没有可用文本。");
  return { result: parseDetection(text), usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0, totalTokens: response.usage?.total_tokens ?? 0 } };
}

async function main(): Promise<void> {
  const options = cli();
  const started = Date.now();
  const [image, qwen] = await Promise.all([imageData(options.imagePath), Promise.resolve(config())]);
  const cacheKey = createHash("sha256").update(image.bytes).update(qwen.model).update(PROMPT_VERSION).digest("hex");
  const cachePath = resolve(CACHE_ROOT, `${cacheKey}.json`);
  let analyzed: Awaited<ReturnType<typeof detect>>;
  let cacheHit = false;
  if (!options.refresh) {
    try { analyzed = { result: parseDetection(await readFile(cachePath, "utf8")), usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }; cacheHit = true; }
    catch { analyzed = await detect(image.dataUrl, qwen); }
  } else analyzed = await detect(image.dataUrl, qwen);
  await Promise.all([mkdir(resolve(PROJECT_ROOT, "output"), { recursive: true }), mkdir(CACHE_ROOT, { recursive: true })]);
  const json = `${JSON.stringify(analyzed.result, null, 2)}\n`;
  const cost = { model: qwen.model, promptVersion: PROMPT_VERSION, cacheKey, cacheHit, qwenCalls: cacheHit ? 0 : 1, ...analyzed.usage, startedAt: new Date(started).toISOString(), completedAt: new Date().toISOString(), totalMs: Date.now() - started };
  await Promise.all([writeFile(OUTPUT_PATH, json, "utf8"), writeFile(COST_PATH, `${JSON.stringify(cost, null, 2)}\n`, "utf8"), cacheHit ? Promise.resolve() : writeFile(cachePath, json, "utf8")]);
  process.stdout.write(json);
  console.error(`结果已保存到：${OUTPUT_PATH}`);
}

main().catch((error: unknown) => { console.error(`错误：${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
