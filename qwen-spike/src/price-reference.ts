import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { processPriceResultWithDaytona } from "./daytona/price-processor.js";
import type { ItemProfile } from "./profile/types.js";
import { captureTavilyPriceFallback, disabledTavilyFallback } from "./price/tavily-price-fallback.js";
import { buildPriceResult } from "./price/matcher.js";
import { captureMarketplaceSearches } from "./price/marketplace-browser.js";
import { captureVerifiedStores, disabledStoreSnapshot } from "./price/store-verifier.js";
import type { PriceCost, PriceTrace, RunMode, SearchSnapshot, StoreSnapshot, TavilyFallbackSnapshot } from "./price/types.js";
import { assertSafeResult, validateSchema } from "./price/validation.js";

type Cli = { mode: RunMode; inputPath: string | null; sourceRunId: string | null; refresh: boolean; verifyStores: boolean };
type Limits = {
  maxCardsScannedPerSource: number;
  maxSamplesPerSource: number;
  maxTotalSamples: number;
  maxDetailPages: number;
  maxStoreSearchPages: number;
  maxVerifiedStores: number;
  priceCacheTtlHours: number;
  storeCacheTtlHours: number;
  maxFallbackResultsToOpen: number;
};
type Artifacts = { runId: string; directory: string; input: string; snapshot: string; fallbackSnapshot: string; storeSnapshot: string; daytonaState: string; result: string; trace: string; cost: string };

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT_ROOT = resolve(PROJECT_ROOT, "output", "price-reference");
const FIXTURE_ROOT = resolve(PROJECT_ROOT, "fixtures", "price-reference");
const PRICE_CACHE_ROOT = resolve(PROJECT_ROOT, ".cache", "price");
const FALLBACK_PRICE_CACHE_ROOT = resolve(PROJECT_ROOT, ".cache", "tavily-price");
const STORE_CACHE_ROOT = resolve(PROJECT_ROOT, ".cache", "stores");
const INPUT_SCHEMA = resolve(PROJECT_ROOT, "schemas", "item-profile.schema.json");
const RESULT_SCHEMA = resolve(PROJECT_ROOT, "schemas", "price-reference-result.schema.json");
const PRICE_SCRAPER_VERSION = "marketplaces-v3";
const STORE_SCRAPER_VERSION = "maps-v1";

class AppError extends Error {
  constructor(message: string) { super(message); this.name = "AppError"; }
}

function parseCli(): Cli {
  const args = process.argv.slice(2);
  if (args[0] === "--replay") {
    const runId = args[1];
    if (args.length !== 2 || !runId || !/^[A-Za-z0-9._-]+$/.test(runId)) throw new AppError("用法：npm run price-reference -- --replay <runId>");
    return { mode: "replay", inputPath: null, sourceRunId: runId, refresh: false, verifyStores: false };
  }
  if (args[0] !== "--fixture" && args[0] !== "--live") throw new AppError("必须选择 --fixture、--live 或 --replay。");
  const inputIndex = args.indexOf("--input");
  const input = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  if (!input) throw new AppError(`用法：npm run price-reference -- ${args[0]} --input <json-file> [--verify-stores] [--refresh]`);
  const allowed = new Set([args[0], "--input", input, "--verify-stores", "--refresh"]);
  if (args.some((arg) => !allowed.has(arg))) throw new AppError("命令包含不支持的参数。");
  if (args[0] === "--fixture" && args.includes("--refresh")) throw new AppError("fixture 不支持 --refresh。");
  return { mode: args[0].slice(2) as RunMode, inputPath: resolve(process.cwd(), input), sourceRunId: null, refresh: args.includes("--refresh"), verifyStores: args.includes("--verify-stores") };
}

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")) as unknown; }
  catch (error) { throw new AppError(`无法读取 JSON ${path}：${error instanceof Error ? error.message : String(error)}`); }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createArtifacts(): Promise<Artifacts> {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const directory = resolve(OUTPUT_ROOT, runId);
  await mkdir(directory);
  return { runId, directory, input: resolve(directory, "input.json"), snapshot: resolve(directory, "search-snapshot.json"), fallbackSnapshot: resolve(directory, "fallback-search-snapshot.json"), storeSnapshot: resolve(directory, "store-snapshot.json"), daytonaState: resolve(directory, "daytona-state.json"), result: resolve(directory, "result.json"), trace: resolve(directory, "trace.json"), cost: resolve(directory, "cost.json") };
}

function enabled(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function positiveInt(name: string, fallback: number, hardMax: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new AppError(`${name} 必须是正整数。`);
  return Math.min(value, hardMax);
}

function loadLimits(): Limits {
  const maxSamplesPerSource = positiveInt("MAX_PRICE_SAMPLES_PER_SOURCE", 5, 5);
  return {
    maxCardsScannedPerSource: positiveInt("MAX_MARKETPLACE_CARDS_SCANNED_PER_SOURCE", 30, 30),
    maxSamplesPerSource,
    maxTotalSamples: Math.min(maxSamplesPerSource * 2, 10),
    maxDetailPages: 0,
    maxStoreSearchPages: 1,
    maxVerifiedStores: positiveInt("MAX_VERIFIED_STORES", 3, 3),
    priceCacheTtlHours: positiveInt("PRICE_CACHE_TTL_HOURS", 24, 168),
    storeCacheTtlHours: positiveInt("STORE_CACHE_TTL_HOURS", 168, 720),
    maxFallbackResultsToOpen: positiveInt("MAX_TAVILY_RESULTS", 2, 2),
  };
}

function hashKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readFreshCache<T>(path: string, ttlHours: number): Promise<T | null> {
  try {
    const info = await stat(path);
    if (Date.now() - info.mtimeMs > ttlHours * 60 * 60 * 1000) return null;
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch { return null; }
}

function assertSnapshot(value: unknown): asserts value is SearchSnapshot {
  const snapshot = value as SearchSnapshot;
  if (!snapshot || snapshot.version !== 2 || !Array.isArray(snapshot.sources)) throw new AppError("search-snapshot.json 格式无效。");
  if (snapshot.sources.map((entry) => entry.source).sort().join(",") !== "Mercari,Rakuten") throw new AppError("search-snapshot.json 必须同时包含 Rakuten 和 Mercari。");
}

function assertStoreSnapshot(value: unknown): asserts value is StoreSnapshot {
  const snapshot = value as StoreSnapshot;
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.stores)) throw new AppError("store-snapshot.json 格式无效。");
}

function assertTavilyFallbackSnapshot(value: unknown): asserts value is TavilyFallbackSnapshot {
  const snapshot = value as TavilyFallbackSnapshot;
  if (!snapshot || snapshot.version !== 1 || snapshot.provider !== "Tavily" || !Array.isArray(snapshot.results) || !Array.isArray(snapshot.candidates) || snapshot.results.length > 2) throw new AppError("fallback-search-snapshot.json 格式无效。");
}

function assertFixture(args: { cost: PriceCost; result: ReturnType<typeof buildPriceResult>["result"]; trace: PriceTrace; verifyStores: boolean }): void {
  if (args.cost.browserSearchPagesOpened !== 0 || args.cost.storeSearchPagesOpened !== 0 || args.cost.detailPagesOpened !== 0 || args.cost.tavilySearchCalls !== 0 || args.cost.tavilyCredits !== 0 || args.cost.fallbackDetailPagesOpened !== 0 || args.cost.qwenCalls !== 0 || args.cost.daytonaCalls !== 0 || args.cost.daytonaSandboxesCreated !== 0) throw new Error("fixture 外部调用必须全部为 0。");
  if (args.result.samples.length !== 10 || args.result.samples.filter((sample) => sample.source === "Rakuten").length !== 5 || args.result.samples.filter((sample) => sample.source === "Mercari").length !== 5) throw new Error("fixture 必须保留 Rakuten/Mercari 各 5 个样本。");
  if (args.result.observedRange.max !== 70000 || args.result.referenceRange.high !== 16000 || args.result.referenceRange.sampleCount !== 9) throw new Error(`fixture 稳健价格区间错误：${JSON.stringify(args.result.referenceRange)}`);
  if (!args.result.samples.some((sample) => sample.aggregationExclusionReason === "price_outlier")) throw new Error("fixture 未识别价格异常值。");
  if (args.verifyStores && args.result.recommendedAreas[0]?.verifiedStores.length !== 2) throw new Error("fixture 店铺验证结果错误。");
  const expectedReasons = ["junk_or_broken", "accessory_or_software_only", "different_model", "bundle_or_lot", "duplicate", "sold_out", "incomplete_item"];
  if (expectedReasons.some((reason) => !args.trace.excluded.some((entry) => entry.reason === reason))) throw new Error("fixture 未覆盖全部必要排除规则。");
}

async function main(): Promise<void> {
  const cli = parseCli();
  dotenv.config({ path: resolve(PROJECT_ROOT, ".env.local"), override: true, quiet: true });
  const limits = loadLimits();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const artifacts = await createArtifacts();
  await Promise.all([mkdir(PRICE_CACHE_ROOT, { recursive: true }), mkdir(FALLBACK_PRICE_CACHE_ROOT, { recursive: true }), mkdir(STORE_CACHE_ROOT, { recursive: true })]);
  let profileRaw: unknown;
  let snapshotRaw: unknown = null;
  let storeRaw: unknown = null;
  let tavilyFallbackRaw: unknown = null;
  if (cli.mode === "replay") {
    const source = resolve(OUTPUT_ROOT, cli.sourceRunId!);
    profileRaw = await readJson(resolve(source, "input.json"));
    snapshotRaw = await readJson(resolve(source, "search-snapshot.json"));
    try { tavilyFallbackRaw = await readJson(resolve(source, "fallback-search-snapshot.json")); } catch { tavilyFallbackRaw = null; }
    try { storeRaw = await readJson(resolve(source, "store-snapshot.json")); } catch { storeRaw = disabledStoreSnapshot(); }
  } else {
    profileRaw = await readJson(cli.inputPath!);
    if (cli.mode === "fixture") {
      snapshotRaw = await readJson(resolve(FIXTURE_ROOT, "search-snapshot.json"));
      storeRaw = cli.verifyStores ? await readJson(resolve(FIXTURE_ROOT, "store-snapshot.json")) : disabledStoreSnapshot();
    }
  }
  const profile = await validateSchema<ItemProfile>(profileRaw, INPUT_SCHEMA, "input");
  if (profile.category === "unknown" || profile.subtype === "unknown") throw new AppError("category/subtype 为 unknown，不能生成可靠的价格搜索。");
  const priceKey = hashKey({ keyword: profile.priceSearchKeywordJa.trim().normalize("NFKC"), version: PRICE_SCRAPER_VERSION });
  const priceCachePath = resolve(PRICE_CACHE_ROOT, `${priceKey}.json`);
  let priceCacheHit = false;
  let browserSearchPagesOpened = 0;
  let snapshot: SearchSnapshot;
  if (cli.mode === "live") {
    const cached = cli.refresh ? null : await readFreshCache<SearchSnapshot>(priceCachePath, limits.priceCacheTtlHours);
    if (cached) {
      assertSnapshot(cached);
      snapshot = cached;
      priceCacheHit = true;
    } else {
      snapshot = await captureMarketplaceSearches({ keyword: profile.priceSearchKeywordJa, maxCardsPerSource: limits.maxCardsScannedPerSource, headless: process.env.PLAYWRIGHT_HEADLESS?.toLowerCase() === "true" });
      browserSearchPagesOpened = 2;
      await writeJson(priceCachePath, snapshot);
    }
  } else {
    assertSnapshot(snapshotRaw);
    snapshot = snapshotRaw;
  }
  const firstArea = profile.recommendedAreas[0];
  const storeKey = cli.verifyStores && firstArea ? hashKey({ subtype: profile.subtype, query: firstArea.storeSearchKeywordJa, version: STORE_SCRAPER_VERSION }) : null;
  const storeCachePath = storeKey ? resolve(STORE_CACHE_ROOT, `${storeKey}.json`) : null;
  let storeCacheHit = false;
  let storeSearchPagesOpened = 0;
  let storeSnapshot: StoreSnapshot;
  if (cli.mode === "live" && cli.verifyStores && firstArea && storeCachePath) {
    const cached = cli.refresh ? null : await readFreshCache<StoreSnapshot>(storeCachePath, limits.storeCacheTtlHours);
    if (cached) {
      assertStoreSnapshot(cached);
      storeSnapshot = cached;
      storeCacheHit = true;
    } else {
      storeSnapshot = await captureVerifiedStores({ query: firstArea.storeSearchKeywordJa, maxStores: limits.maxVerifiedStores, headless: process.env.PLAYWRIGHT_HEADLESS?.toLowerCase() === "true" });
      storeSearchPagesOpened = 1;
      await writeJson(storeCachePath, storeSnapshot);
    }
  } else if (cli.mode === "fixture" || cli.mode === "replay") {
    assertStoreSnapshot(storeRaw);
    storeSnapshot = storeRaw;
  } else {
    storeSnapshot = disabledStoreSnapshot();
  }
  const disabledFallback = disabledTavilyFallback(profile);
  const primaryBuilt = buildPriceResult({ profile, snapshot, tavilyFallback: disabledFallback, storeSnapshot, maxCardsScannedPerSource: limits.maxCardsScannedPerSource, maxSamplesPerSource: limits.maxSamplesPerSource });
  const noRakutenMatches = primaryBuilt.result.samples.every((sample) => sample.source !== "Rakuten");
  const noMercariMatches = primaryBuilt.result.samples.every((sample) => sample.source !== "Mercari");
  const shouldUseTavilyFallback = noRakutenMatches && noMercariMatches && enabled("ENABLE_TAVILY_PRICE_FALLBACK");
  const tavilyFallbackKey = shouldUseTavilyFallback ? hashKey({ profile: { itemName: profile.itemName, brandCharacterSeries: profile.brandCharacterSeries, versionOrPeriod: profile.versionOrPeriod, subtype: profile.subtype }, query: disabledFallback.query, version: "tavily-price-v2" }) : null;
  const tavilyFallbackCachePath = tavilyFallbackKey ? resolve(FALLBACK_PRICE_CACHE_ROOT, `${tavilyFallbackKey}.json`) : null;
  let tavilyFallbackCacheHit = false;
  let tavilySearchCalls = 0;
  let fallbackDetailPagesOpened = 0;
  let tavilyFallback: TavilyFallbackSnapshot = disabledFallback;
  if (cli.mode === "replay" && tavilyFallbackRaw) {
    assertTavilyFallbackSnapshot(tavilyFallbackRaw);
    tavilyFallback = tavilyFallbackRaw;
  } else if (cli.mode === "live" && shouldUseTavilyFallback && tavilyFallbackCachePath) {
    const cached = cli.refresh ? null : await readFreshCache<TavilyFallbackSnapshot>(tavilyFallbackCachePath, limits.priceCacheTtlHours);
    if (cached) {
      assertTavilyFallbackSnapshot(cached);
      tavilyFallback = cached;
      tavilyFallbackCacheHit = true;
    } else {
      tavilyFallback = await captureTavilyPriceFallback({ profile, apiKey: process.env.TAVILY_API_KEY?.trim(), maxResultsToOpen: limits.maxFallbackResultsToOpen, headless: process.env.PLAYWRIGHT_HEADLESS?.toLowerCase() === "true" });
      tavilySearchCalls = 1;
      fallbackDetailPagesOpened = tavilyFallback.results.filter((result) => result.opened).length;
      await writeJson(tavilyFallbackCachePath, tavilyFallback);
    }
  }
  const built = tavilyFallback.triggered
    ? buildPriceResult({ profile, snapshot, tavilyFallback, storeSnapshot, maxCardsScannedPerSource: limits.maxCardsScannedPerSource, maxSamplesPerSource: limits.maxSamplesPerSource })
    : primaryBuilt;
  const daytonaEnabled = cli.mode === "live" && enabled("ENABLE_DAYTONA_PROCESSING");
  const daytona = await processPriceResultWithDaytona(built.result, {
    enabled: daytonaEnabled,
    sessionId: artifacts.runId,
    apiKey: process.env.DAYTONA_API_KEY?.trim(),
    apiUrl: process.env.DAYTONA_API_URL?.trim(),
    target: process.env.DAYTONA_TARGET?.trim(),
    createTimeoutSeconds: positiveInt("DAYTONA_CREATE_TIMEOUT_SECONDS", 60, 120),
    executionTimeoutSeconds: positiveInt("DAYTONA_EXECUTION_TIMEOUT_SECONDS", 30, 60),
    stateTtlHours: positiveInt("DAYTONA_STATE_TTL_HOURS", 168, 168),
  });
  if (daytona.report.verificationStatus === "mismatch") built.result.warnings.push(`Daytona 验证结果与 Node 计算不一致，已保留 Node 确定性结果：${daytona.report.error ?? "unknown error"}`);
  if (daytona.report.verificationStatus === "unavailable") built.result.warnings.push(`Daytona 验证不可用，已保留 Node 确定性结果：${daytona.report.error ?? "unknown error"}`);
  assertSafeResult(built.result);
  await validateSchema(built.result, RESULT_SCHEMA, "result");
  const completed = Date.now();
  const completedAt = new Date(completed).toISOString();
  const trace: PriceTrace = {
    runId: artifacts.runId,
    mode: cli.mode,
    sourceRunId: cli.sourceRunId,
    priceSearchKeywordJa: profile.priceSearchKeywordJa,
    sourceSearches: [
      ...snapshot.sources.map((entry) => ({ source: entry.source, keyword: entry.keyword, searchUrl: entry.searchUrl, error: entry.error, candidatesScanned: Math.min(entry.candidates.length, limits.maxCardsScannedPerSource) })),
      ...(tavilyFallback.triggered ? [{ source: "Web fallback" as const, keyword: tavilyFallback.query, searchUrl: tavilyFallback.searchUrl, error: tavilyFallback.searchError, candidatesScanned: tavilyFallback.results.length }] : []),
    ],
    included: built.result.samples.map(({ source, rank, url }) => ({ source, rank, url })),
    excluded: built.excluded,
    aggregation: built.result.samples.map((sample) => ({ source: sample.source, rank: sample.rank, url: sample.url, included: sample.includedInReferenceRange, reason: sample.aggregationExclusionReason })),
    limits,
    cache: { priceHit: priceCacheHit, storeHit: storeCacheHit, tavilyFallbackHit: tavilyFallbackCacheHit, refresh: cli.refresh, priceKey, storeKey, tavilyFallbackKey },
    errors: [...snapshot.sources.flatMap((entry) => entry.error ? [`${entry.source}: ${entry.error}`] : []), ...(tavilyFallback.searchError ? [`Tavily fallback: ${tavilyFallback.searchError}`] : []), ...tavilyFallback.results.flatMap((result) => result.pageError ? [`Fallback result ${result.rank}: ${result.pageError}`] : []), ...(storeSnapshot.error ? [`Google Maps: ${storeSnapshot.error}`] : [])],
    warnings: built.result.warnings,
    daytona: daytona.report,
    tavilyFallback: { triggered: tavilyFallback.triggered, query: tavilyFallback.query, searchUrl: tavilyFallback.searchUrl, searchError: tavilyFallback.searchError, resultsOpened: tavilyFallback.results.filter((result) => result.opened).length, validPrices: tavilyFallback.candidates.length },
    startedAt,
    completedAt,
  };
  const tavilyCredits = typeof tavilyFallback.usage?.credits === "number" ? tavilyFallback.usage.credits : 0;
  const cost: PriceCost = { mode: cli.mode, browserSearchPagesOpened, storeSearchPagesOpened, detailPagesOpened: 0, qwenCalls: 0, inputTokens: 0, outputTokens: 0, daytonaCalls: daytona.report.attempted ? 1 : 0, daytonaSandboxesCreated: daytona.report.sandboxId ? 1 : 0, daytonaDurationMs: daytona.report.durationMs, tavilySearchCalls, tavilyCredits, fallbackDetailPagesOpened, priceCacheHit, storeCacheHit, startedAt, completedAt, totalMs: completed - started };
  if (cli.mode === "fixture") assertFixture({ cost, result: built.result, trace, verifyStores: cli.verifyStores });
  await Promise.all([writeJson(artifacts.input, profile), writeJson(artifacts.snapshot, snapshot), writeJson(artifacts.fallbackSnapshot, tavilyFallback), writeJson(artifacts.storeSnapshot, storeSnapshot), writeJson(artifacts.daytonaState, daytona.state ?? { version: 1, sessionId: artifacts.runId, processor: "local_node", daytona: daytona.report }), writeJson(artifacts.result, built.result), writeJson(artifacts.trace, trace), writeJson(artifacts.cost, cost)]);
  process.stdout.write(`${JSON.stringify(built.result, null, 2)}\n`);
  console.error(`运行目录：${artifacts.directory}`);
}

main().catch((error: unknown) => {
  console.error(`错误：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
