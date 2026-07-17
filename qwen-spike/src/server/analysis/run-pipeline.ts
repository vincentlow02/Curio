import "server-only";
import { readFile } from "node:fs/promises";
import type { AnalysisResult } from "../../core/analysis/types";
import { toLegacyItemProfile } from "../../core/profile/legacy-adapter";
import { assertSafeRecommendations, recommendAreas, verifiedStoreSuggestions } from "../../core/recommendation/recommend";
import { processPriceResultWithDaytona } from "../../daytona/price-processor";
import { buildPriceResult } from "../../price/matcher";
import { captureMarketplaceSearches } from "../../price/marketplace-browser";
import { disabledStoreSnapshot } from "../../price/store-verifier";
import { captureTavilyPriceFallback, disabledTavilyFallback } from "../../price/tavily-price-fallback";
import { env } from "../config/env";
import { detectCollectible } from "../providers/qwen/detect";
import { deleteImage, internalSession, saveCost, updateSession } from "../sessions/session-store";
import { publicError } from "../security/redact-error";
import { fixtureResult } from "./fixture-result";

function timeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error("分析超过时间限制，请稍后重试。")), milliseconds))]);
}

async function livePipeline(id: string): Promise<AnalysisResult | null> {
  const started = Date.now();
  const session = internalSession(id);
  if (!session) throw new Error("分析任务不存在。");
  await updateSession(id, { status: "identifying", queuePosition: null, progress: 14, message: "正在识别收藏品" });
  let detected: Awaited<ReturnType<typeof detectCollectible>>;
  try {
    const bytes = await readFile(session.imagePath);
    const dataUrl = `data:${session.mimeType};base64,${bytes.toString("base64")}`;
    detected = await detectCollectible(dataUrl);
  } finally {
    await deleteImage(id);
  }
  if (detected.outcome.status === "needs_review") {
    await updateSession(id, { status: "needs_review", progress: 100, message: "需要重新确认图片", error: detected.outcome.reason });
    return null;
  }
  const profile = toLegacyItemProfile(detected.outcome.result);
  await updateSession(id, { status: "searching_marketplaces", progress: 38, message: "正在读取 Rakuten 与 Mercari 挂牌样本" });
  const snapshot = await captureMarketplaceSearches({ keyword: detected.outcome.result.priceSearchKeywordJa, maxCardsPerSource: 30, headless: env.headless });
  let fallback = disabledTavilyFallback(profile);
  let built = buildPriceResult({ profile, snapshot, tavilyFallback: fallback, storeSnapshot: disabledStoreSnapshot(), maxCardsScannedPerSource: 30, maxSamplesPerSource: 5 });
  if (built.result.samples.length === 0 && env.enableTavily) {
    await updateSession(id, { status: "searching_fallback", progress: 58, message: "主要来源暂无有效样本，正在执行一次受控备用搜索" });
    fallback = await captureTavilyPriceFallback({ profile, apiKey: env.tavilyApiKey, maxResultsToOpen: 2, headless: env.headless });
    built = buildPriceResult({ profile, snapshot, tavilyFallback: fallback, storeSnapshot: disabledStoreSnapshot(), maxCardsScannedPerSource: 30, maxSamplesPerSource: 5 });
  }
  await updateSession(id, { status: "processing_prices", progress: 78, message: "正在去重并计算价格区间" });
  const daytona = await processPriceResultWithDaytona(built.result, {
    enabled: env.enableDaytona,
    sessionId: id,
    apiKey: env.daytonaApiKey,
    apiUrl: env.daytonaApiUrl,
    target: env.daytonaTarget,
    createTimeoutSeconds: 60,
    executionTimeoutSeconds: 30,
    stateTtlHours: 168,
  });
  const areas = recommendAreas(detected.outcome.result.category);
  const stores = verifiedStoreSuggestions([]);
  assertSafeRecommendations(areas, stores);
  const reference = built.result.referenceRange;
  const warnings = [...built.result.warnings];
  if (!stores.length) warnings.push("尚未取得具有来源证据的东京实体店，建议按区域关键词到店前确认。");
  if (daytona.report.error) warnings.push("远程价格处理暂不可用，已使用本地确定性计算结果。");
  const result: AnalysisResult = {
    identification: detected.outcome.result,
    priceReference: {
      currency: "JPY", low: reference.low, median: reference.median, high: reference.high, sampleCount: reference.sampleCount,
      samples: built.result.samples.map(({ title, price, currency, source, url, condition, versionMatch, packageStatus, includedInReferenceRange }) => ({ title, price, currency, source, url, condition, versionMatch, packageStatus, includedInReferenceRange })),
      disclaimer: "Online asking-price reference",
    },
    recommendedAreas: areas,
    storeSuggestions: stores,
    warnings,
    cost: {
      qwenCalls: 1,
      inputTokens: detected.usage.inputTokens,
      outputTokens: detected.usage.outputTokens,
      marketplacePages: 2,
      tavilyCalls: fallback.triggered ? 1 : 0,
      daytonaCalls: daytona.report.attempted ? 1 : 0,
      totalMs: Date.now() - started,
    },
  };
  return result;
}

export async function runAnalysis(id: string): Promise<void> {
  try {
    let result: AnalysisResult | null;
    if (env.fixtureMode) {
      await updateSession(id, { status: "identifying", queuePosition: null, progress: 25, message: "正在读取演示识别结果" });
      await deleteImage(id);
      result = fixtureResult();
    } else {
      result = await timeout(livePipeline(id), env.analysisTimeoutSeconds * 1000);
    }
    if (!result) return;
    await saveCost(id, result.cost);
    await updateSession(id, { status: "completed", progress: 100, message: "分析完成", result, error: null });
  } catch (error) {
    await deleteImage(id);
    await updateSession(id, { status: "failed", progress: 100, message: "分析失败", error: publicError(error) });
  }
}
