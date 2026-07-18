import "server-only";
import { readFile } from "node:fs/promises";
import type { AnalysisResult, CollectorEvidence, ToolActivity } from "../../core/analysis/types";
import type { DetectionResult } from "../../core/profile/types";
import { toLegacyItemProfile } from "../../core/profile/legacy-adapter";
import { assertSafeRecommendations, recommendAreas, verifiedStoreSuggestions } from "../../core/recommendation/recommend";
import { processPriceResultWithDaytona } from "../../daytona/price-processor";
import { buildPriceResult } from "../../price/matcher";
import { captureMarketplaceSearches } from "../../price/marketplace-browser";
import { disabledStoreSnapshot } from "../../price/store-verifier";
import { captureTavilyPriceFallback, disabledTavilyFallback } from "../../price/tavily-price-fallback";
import { env } from "../config/env";
import { detectCollectible, detectTextCollectible } from "../providers/qwen/detect";
import { captureAuctionSearches, skippedAuctionSources } from "../providers/auctions/capture-auctions";
import { deleteImage, internalSession, replaceToolActivity, saveCost, updateSession } from "../sessions/session-store";
import { publicError } from "../security/redact-error";
import { fixtureResult } from "./fixture-result";

async function setActivity(id: string, activity: ToolActivity): Promise<void> {
  const session = internalSession(id);
  if (!session) return;
  await updateSession(id, { toolActivity: replaceToolActivity(session.toolActivity, activity) });
}

async function patchActivity(id: string, provider: ToolActivity["provider"], patch: Partial<ToolActivity>): Promise<void> {
  const current = internalSession(id)?.toolActivity.find((entry) => entry.provider === provider);
  if (!current) return;
  await setActivity(id, { ...current, ...patch, provider });
}

function qwenCost(activities: ToolActivity[]): { inputTokens: number; outputTokens: number } {
  const qwen = activities.find((entry) => entry.provider === "Qwen");
  return { inputTokens: qwen?.inputTokens ?? 0, outputTokens: qwen?.outputTokens ?? 0 };
}

export async function runDetection(id: string): Promise<void> {
  const started = Date.now();
  try {
    const session = internalSession(id);
    if (!session) throw new Error("The analysis session does not exist.");
    await updateSession(id, { status: "identifying", queuePosition: null, progress: 18, message: session.imagePath ? "Identifying the collectible from the image" : "Identifying the collectible from the description" });
    const model = session.imagePath ? env.qwenVisionModel : env.qwenTextModel;
    await setActivity(id, { provider: "Qwen", status: "running", calls: 1, durationMs: null, model });

    let identification: DetectionResult;
    let collectorEvidence: CollectorEvidence | null = null;
    let usage = { inputTokens: 0, outputTokens: 0 };
    if (env.fixtureMode) {
      identification = fixtureResult().identification;
      collectorEvidence = session.collectorMode ? fixtureResult({ collectorMode: true }).collectorEvidence : null;
      await deleteImage(id);
    } else if (session.imagePath && session.mimeType) {
      try {
        const bytes = await readFile(session.imagePath);
        const detected = await detectCollectible(`data:${session.mimeType};base64,${bytes.toString("base64")}`, session.selectedCategory, session.inputText, session.collectorMode);
        usage = detected.usage;
        collectorEvidence = detected.collectorEvidence;
        if (detected.outcome.status === "needs_review") {
          await setActivity(id, { provider: "Qwen", status: "failed", calls: 1, durationMs: Date.now() - started, model, ...usage });
          await updateSession(id, { status: "needs_review", progress: 100, message: "More identification details are needed", error: detected.outcome.reason });
          return;
        }
        identification = detected.outcome.result;
      } finally {
        await deleteImage(id);
      }
    } else {
      const detected = await detectTextCollectible(session.inputText, session.selectedCategory, session.collectorMode);
      usage = detected.usage;
      collectorEvidence = detected.collectorEvidence;
      if (detected.outcome.status === "needs_review") {
        await setActivity(id, { provider: "Qwen", status: "failed", calls: 1, durationMs: Date.now() - started, model, ...usage });
        await updateSession(id, { status: "needs_review", progress: 100, message: "More identification details are needed", error: detected.outcome.reason });
        return;
      }
      identification = detected.outcome.result;
    }

    await setActivity(id, { provider: "Qwen", status: "succeeded", calls: env.fixtureMode ? 0 : 1, durationMs: Date.now() - started, model, ...usage });
    await updateSession(id, { status: "identified", identification, collectorEvidence, progress: 32, message: "Identification complete. Review the fields before continuing.", error: null });
  } catch (error) {
    await deleteImage(id);
    await setActivity(id, { provider: "Qwen", status: "failed", calls: 1, durationMs: Date.now() - started, model: internalSession(id)?.imagePath ? env.qwenVisionModel : env.qwenTextModel });
    await updateSession(id, { status: "failed", progress: 100, message: "Identification failed", error: publicError(error) });
  }
}

export async function runResearch(id: string, identification: DetectionResult): Promise<void> {
  const started = Date.now();
  try {
    const session = internalSession(id);
    if (!session) throw new Error("The analysis session does not exist.");
    if (env.fixtureMode) {
      const result = { ...fixtureResult({ collectorMode: session.collectorMode }), identification };
      await saveCost(id, result.cost);
      await updateSession(id, { status: "completed", identification, progress: 100, message: "Analysis complete", result, error: null });
      return;
    }

    const profile = toLegacyItemProfile(identification);
    await updateSession(id, { status: "searching_marketplaces", identification, queuePosition: null, progress: 45, message: "Searching Rakuten and Mercari asking-price listings" });
    const marketStarted = Date.now();
    // Session activity writes are intentionally serialized so neither provider
    // can overwrite the other provider's status in the in-memory session.
    await setActivity(id, { provider: "Rakuten", status: "running", calls: 1, durationMs: null });
    await setActivity(id, { provider: "Mercari", status: "running", calls: 1, durationMs: null });
    const snapshot = await captureMarketplaceSearches({ keyword: identification.priceSearchKeywordJa, maxCardsPerSource: 30, headless: env.headless });
    for (const source of snapshot.sources) {
      await setActivity(id, {
        provider: source.source,
        status: source.error ? "failed" : "succeeded",
        calls: 1,
        durationMs: Date.now() - marketStarted,
        resultCount: source.candidates.length,
        cacheHit: false,
      });
    }

    let auctionSources = skippedAuctionSources();
    if (session.collectorMode) {
      await updateSession(id, { status: "searching_auctions", progress: 58, message: "Searching Yahoo! Auctions and Mandarake Auction" });
      const auctionStarted = Date.now();
      await setActivity(id, { provider: "Yahoo Auctions", status: "running", calls: 1, durationMs: null });
      await setActivity(id, { provider: "Mandarake Auction", status: "running", calls: 1, durationMs: null });
      auctionSources = await captureAuctionSearches({ identification, collectorEvidence: session.collectorEvidence, headless: env.headless });
      for (const source of auctionSources) {
        await setActivity(id, {
          provider: source.source,
          status: source.status === "failed" ? "failed" : "succeeded",
          calls: 1,
          durationMs: Date.now() - auctionStarted,
          resultCount: source.candidatesSeen,
          validResultCount: source.comparableSignals,
          cacheHit: false,
        });
      }
    } else {
      await setActivity(id, { provider: "Yahoo Auctions", status: "skipped", calls: 0, durationMs: 0, resultCount: 0, validResultCount: 0 });
      await setActivity(id, { provider: "Mandarake Auction", status: "skipped", calls: 0, durationMs: 0, resultCount: 0, validResultCount: 0 });
    }

    let fallback = disabledTavilyFallback(profile);
    let built = buildPriceResult({ profile, snapshot, tavilyFallback: fallback, storeSnapshot: disabledStoreSnapshot(), maxCardsScannedPerSource: 30, maxSamplesPerSource: 5 });
    if (built.result.samples.length === 0 && env.enableTavily) {
      await updateSession(id, { status: "searching_fallback", progress: 62, message: "No comparable primary samples found. Running one controlled fallback search." });
      const tavilyStarted = Date.now();
      await setActivity(id, { provider: "Tavily", status: "running", calls: 1, durationMs: null });
      fallback = await captureTavilyPriceFallback({ profile, apiKey: env.tavilyApiKey, maxResultsToOpen: 2, headless: env.headless });
      await setActivity(id, { provider: "Tavily", status: fallback.searchError ? "failed" : "fallback", calls: 1, durationMs: Date.now() - tavilyStarted, resultCount: fallback.candidates.length, cacheHit: false });
      built = buildPriceResult({ profile, snapshot, tavilyFallback: fallback, storeSnapshot: disabledStoreSnapshot(), maxCardsScannedPerSource: 30, maxSamplesPerSource: 5 });
    } else {
      await setActivity(id, { provider: "Tavily", status: "skipped", calls: 0, durationMs: 0, resultCount: 0 });
    }

    await patchActivity(id, "Rakuten", { validResultCount: built.result.samples.filter((sample) => sample.source === "Rakuten").length });
    await patchActivity(id, "Mercari", { validResultCount: built.result.samples.filter((sample) => sample.source === "Mercari").length });
    await patchActivity(id, "Tavily", { validResultCount: built.result.samples.filter((sample) => sample.source === "Web fallback").length });

    await updateSession(id, { status: "processing_prices", progress: 80, message: "Cleaning samples and calculating the price range in Daytona" });
    await setActivity(id, { provider: "Daytona", status: env.enableDaytona ? "running" : "skipped", calls: env.enableDaytona ? 1 : 0, durationMs: null });
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
    await setActivity(id, {
      provider: "Daytona",
      status: daytona.report.succeeded ? "succeeded" : daytona.report.fallbackUsed ? "fallback" : "skipped",
      calls: daytona.report.attempted ? 1 : 0,
      durationMs: daytona.report.durationMs,
      fallbackUsed: daytona.report.fallbackUsed,
    });

    const areas = recommendAreas(identification.category);
    const stores = verifiedStoreSuggestions([]);
    assertSafeRecommendations(areas, stores);
    const reference = built.result.referenceRange;
    const warnings = [...built.result.warnings];
    if (session.collectorMode && auctionSources.every((source) => source.comparableSignals === 0)) warnings.push("No comparable public active-auction signals were found. No additional auction search was attempted.");
    for (const source of auctionSources.filter((entry) => entry.status === "failed")) warnings.push(`${source.source} could not be read; the other sources and marketplace range are unaffected.`);
    if (!stores.length) warnings.push("No Tokyo physical store with verified source evidence is available yet. Use the area map search and confirm before visiting.");
    if (daytona.report.error) warnings.push("Daytona processing was unavailable. The deterministic Node.js result was used instead.");
    const current = internalSession(id);
    const tokens = qwenCost(current?.toolActivity ?? []);
    const result: AnalysisResult = {
      identification,
      collectorMode: session.collectorMode,
      collectorEvidence: session.collectorMode ? session.collectorEvidence : null,
      auctionSources,
      priceReference: {
        currency: "JPY",
        low: reference.low,
        median: reference.median,
        high: reference.high,
        sampleCount: reference.sampleCount,
        samples: built.result.samples.map(({ title, price, currency, source, url, condition, versionMatch, packageStatus, includedInReferenceRange }) => ({ title, price, currency, source, url, condition, versionMatch, packageStatus, includedInReferenceRange })),
        disclaimer: "Online asking-price reference",
      },
      recommendedAreas: areas,
      storeSuggestions: stores,
      warnings,
      cost: {
        qwenCalls: 1,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        marketplacePages: 2,
        auctionPages: session.collectorMode ? 2 : 0,
        tavilyCalls: fallback.triggered ? 1 : 0,
        daytonaCalls: daytona.report.attempted ? 1 : 0,
        totalMs: Date.now() - Date.parse(session.createdAt),
      },
    };
    await saveCost(id, result.cost);
    await updateSession(id, { status: "completed", progress: 100, message: "Analysis complete", result, error: null });
  } catch (error) {
    await updateSession(id, { status: "failed", progress: 100, message: "Research failed", error: publicError(error) });
  }
}
