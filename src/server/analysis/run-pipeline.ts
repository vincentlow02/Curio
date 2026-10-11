import "server-only";

import { randomUUID } from "node:crypto";

import type { AnalysisResult, AnalysisStage, CollectorEvidence, ToolActivity } from "../../core/analysis/types";
import type { CollectibleCategory, DetectionResult } from "../../core/profile/types";
import { MARKETPLACE_SOURCE_IDS, WEB_FALLBACK_SOURCE } from "../../core/marketplace";
import { toPriceItemProfile } from "../../core/profile/to-price-profile";
import { assertSafeRecommendations, recommendAreas, verifiedStoreSuggestions } from "../../core/recommendation/recommend";
import { buildPriceResult } from "../../price/matcher";
import { coordinateMarketplaceSearches } from "../providers/marketplaces/coordinator";
import { selectMarketplaceProviders } from "../providers/marketplaces/selector";
import { disabledStoreSnapshot } from "../../price/store-verifier";
import { captureTavilyPriceFallback, disabledTavilyFallback } from "../../price/tavily-price-fallback";
import type { MarketplaceSource, SearchSnapshot } from "../../price/types";
import { browserProvider, type BrowserLease } from "../browser/browser-provider";
import type { BrowserSessionUsage } from "../browser/session-meter";
import { env } from "../config/env";
import { captureAuctionSearches, skippedAuctionSources } from "../providers/auctions/capture-auctions";
import { detectCollectible, detectTextCollectible } from "../providers/qwen/detect";
import { publicError } from "../security/redact-error";
import { fixtureResult } from "./fixture-result";
import { createResearchDeadline } from "./research-deadline";
import { ResearchCostTracker } from "./marketplace-cost-tracker";
import { persistMarketplaceCostRecords } from "./marketplace-cost-store";

export type IdentificationWorkflowInput = { imageDataUrl: string | null; inputText: string; selectedCategory: CollectibleCategory | null; collectorMode: boolean; locale: "en" | "zh" | "ja" };
export type IdentificationWorkflowResult = { status: "identified" | "needs_review" | "failed"; identification: DetectionResult | null; collectorEvidence: CollectorEvidence | null; toolActivity: ToolActivity[]; error: string | null };
export type ResearchWorkflowInput = { identification: DetectionResult; collectorMode: boolean; collectorEvidence: CollectorEvidence | null; qwenActivity?: ToolActivity | null; signal?: AbortSignal; onStage?: (event: { status: AnalysisStage; message: string; toolActivity: ToolActivity[] }) => void | Promise<void> };
export type ResearchWorkflowResult = { result: AnalysisResult; toolActivity: ToolActivity[] };

function upsert(activities: ToolActivity[], activity: ToolActivity): ToolActivity[] { return [...activities.filter((entry) => entry.provider !== activity.provider), activity]; }
function emptySnapshot(keyword: string, error: string, sources: readonly MarketplaceSource[]): SearchSnapshot {
  return { version: 2, capturedAt: new Date().toISOString(), sources: sources.map((source) => ({ source, keyword, searchUrl: "", error, candidates: [] })) };
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error(typeof signal.reason === "string" ? signal.reason : "Research was cancelled.");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

export async function identifyCollectible(input: IdentificationWorkflowInput): Promise<IdentificationWorkflowResult> {
  const started = Date.now();
  const model = input.imageDataUrl ? env.qwenVisionModel : env.qwenTextModel;
  try {
    if (env.fixtureMode) {
      const fixture = fixtureResult({ collectorMode: input.collectorMode });
      return { status: "identified", identification: fixture.identification, collectorEvidence: input.collectorMode ? fixture.collectorEvidence : null, toolActivity: [{ provider: "Qwen", status: "succeeded", calls: 0, durationMs: Date.now() - started, model, inputTokens: 0, outputTokens: 0 }], error: null };
    }
    const detected = input.imageDataUrl
      ? await detectCollectible(input.imageDataUrl, input.selectedCategory, input.inputText, input.collectorMode, input.locale)
      : await detectTextCollectible(input.inputText, input.selectedCategory, input.collectorMode, input.locale);
    const activity: ToolActivity = { provider: "Qwen", status: detected.outcome.status === "needs_review" ? "failed" : "succeeded", calls: 1, durationMs: Date.now() - started, model, ...detected.usage };
    if (detected.outcome.status === "needs_review") return { status: "needs_review", identification: null, collectorEvidence: detected.collectorEvidence, toolActivity: [activity], error: detected.outcome.reason };
    return { status: "identified", identification: detected.outcome.result, collectorEvidence: detected.collectorEvidence, toolActivity: [activity], error: null };
  } catch (error) {
    return { status: "failed", identification: null, collectorEvidence: null, toolActivity: [{ provider: "Qwen", status: "failed", calls: 1, durationMs: Date.now() - started, model }], error: publicError(error, "The identification provider was unavailable.") };
  }
}

export async function researchCollectible(input: ResearchWorkflowInput): Promise<ResearchWorkflowResult> {
  const startedAt = Date.now();
  const deadline = createResearchDeadline();
  const workflowSignal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;
  let costTracker: ResearchCostTracker | null = null;
  let browserLeasePromise: Promise<BrowserLease> | null = null;
  let browserLeaseClosePromise: Promise<void> | null = null;
  let closedBrowserSession: BrowserSessionUsage | null = null;
  let removeBrowserAbortListeners = (): void => undefined;
  const closeBrowserLease = (): Promise<void> => {
    if (!browserLeasePromise) return Promise.resolve();
    if (!browserLeaseClosePromise) {
      browserLeaseClosePromise = browserLeasePromise
        .then(async (lease) => {
          removeBrowserAbortListeners();
          await lease.close();
        })
        .catch(() => undefined);
    }
    return browserLeaseClosePromise;
  };
  const getBrowserLease = (): Promise<BrowserLease> => {
    throwIfAborted(workflowSignal);
    if (!browserLeasePromise) {
      browserLeasePromise = browserProvider.open({ locale: "ja-JP", onSessionClosed: (session) => { closedBrowserSession = session; } }).then(async (lease) => {
        if (workflowSignal.aborted) {
          await lease.close();
          throw abortError(workflowSignal);
        }
        const closeOnAbort = (): void => { void closeBrowserLease(); };
        workflowSignal.addEventListener("abort", closeOnAbort, { once: true });
        removeBrowserAbortListeners = () => workflowSignal.removeEventListener("abort", closeOnAbort);
        return lease;
      });
    }
    return browserLeasePromise;
  };
  const getBrowserContext = async () => (await getBrowserLease()).context;
  let activities: ToolActivity[] = input.qwenActivity?.provider === "Qwen" ? [input.qwenActivity] : [];
  const setActivity = (activity: ToolActivity): void => { activities = upsert(activities, activity); };
  const emit = async (status: AnalysisStage, message: string): Promise<void> => { await input.onStage?.({ status, message, toolActivity: activities }); };
  try {
    if (env.fixtureMode) return { result: { ...fixtureResult({ collectorMode: input.collectorMode }), identification: input.identification }, toolActivity: activities };

    const runCostTracker = new ResearchCostTracker(randomUUID());
    costTracker = runCostTracker;
    const profile = toPriceItemProfile(input.identification);
    const marketplaceProviders = selectMarketplaceProviders(profile);
    const marketplaceSources = marketplaceProviders.map(({ source }) => source);
    let marketplacePagesOpened = 0;
    for (const source of MARKETPLACE_SOURCE_IDS) {
      setActivity(marketplaceProviders.some((provider) => provider.source === source)
        ? { provider: source, status: "running", calls: 0, durationMs: null }
        : { provider: source, status: "skipped", calls: 0, durationMs: 0, resultCount: 0, validResultCount: 0 });
    }
    if (input.collectorMode) {
      setActivity({ provider: "Yahoo Auctions", status: "running", calls: 1, durationMs: null });
      setActivity({ provider: "Mandarake Auction", status: "running", calls: 1, durationMs: null });
    } else {
      setActivity({ provider: "Yahoo Auctions", status: "skipped", calls: 0, durationMs: 0, resultCount: 0, validResultCount: 0 });
      setActivity({ provider: "Mandarake Auction", status: "skipped", calls: 0, durationMs: 0, resultCount: 0, validResultCount: 0 });
    }
    await emit("searching_marketplaces", input.collectorMode ? "Searching marketplaces and public auctions" : "Searching Rakuten and Mercari asking-price listings");

    throwIfAborted(workflowSignal);
    const browserStarted = Date.now();
    let snapshot: SearchSnapshot;
    let marketplaceDurationsMs: Partial<Record<MarketplaceSource, number>> = {};
    let marketplaceCallsBySource: Partial<Record<MarketplaceSource, number>> = {};
    let auctionSources = skippedAuctionSources();
    try {
      const marketplaceSearch = coordinateMarketplaceSearches({
        profile,
        keyword: input.identification.priceSearchKeywordJa,
        maxCardsPerSource: 30,
        signal: workflowSignal,
        getBrowserContext,
        costTracker: runCostTracker,
        onBrowserPageOpened: () => { marketplacePagesOpened += 1; },
      });
      const auctionSearch = input.collectorMode
        ? getBrowserContext().then((context) => captureAuctionSearches({ context, identification: input.identification, collectorEvidence: input.collectorEvidence, costTracker: runCostTracker }))
        : null;
      const marketplaceSettled = await Promise.allSettled([marketplaceSearch]);
      const auctionSettled = auctionSearch ? await Promise.allSettled([auctionSearch]) : null;
      throwIfAborted(workflowSignal);
      const market = marketplaceSettled[0];
      if (market?.status === "fulfilled") {
        snapshot = market.value.snapshot;
        marketplaceDurationsMs = market.value.durationMsBySource;
        marketplaceCallsBySource = market.value.callsBySource;
      } else {
        snapshot = emptySnapshot(input.identification.priceSearchKeywordJa, market?.status === "rejected" ? publicError(market.reason) : "Marketplace search failed.", marketplaceSources);
      }
      const auctions = auctionSettled?.[0];
      if (input.collectorMode && auctions) auctionSources = auctions.status === "fulfilled" ? auctions.value as typeof auctionSources : (["Yahoo Auctions", "Mandarake Auction"] as const).map((source) => ({ source, status: "failed" as const, candidatesSeen: 0, comparableSignals: 0, signals: [] }));
    } catch (error) {
      if (workflowSignal.aborted) throw error;
      snapshot = emptySnapshot(input.identification.priceSearchKeywordJa, publicError(error, "The browser provider was unavailable."), marketplaceSources);
      if (input.collectorMode) auctionSources = (["Yahoo Auctions", "Mandarake Auction"] as const).map((source) => ({ source, status: "failed" as const, candidatesSeen: 0, comparableSignals: 0, signals: [] }));
    }
    for (const source of snapshot.sources) setActivity({ provider: source.source, status: source.error ? "failed" : "succeeded", calls: marketplaceCallsBySource[source.source] ?? 0, durationMs: marketplaceDurationsMs[source.source] ?? Date.now() - browserStarted, resultCount: source.candidates.length, cacheHit: false });
    for (const source of auctionSources) setActivity({ provider: source.source, status: source.status === "failed" ? "failed" : source.status === "skipped" ? "skipped" : "succeeded", calls: source.status === "skipped" ? 0 : 1, durationMs: source.status === "skipped" ? 0 : Date.now() - browserStarted, resultCount: source.candidatesSeen, validResultCount: source.comparableSignals, cacheHit: false });

    let fallback = disabledTavilyFallback(profile);
    let nodeStarted = Date.now();
    let built = buildPriceResult({ profile, snapshot, tavilyFallback: fallback, storeSnapshot: disabledStoreSnapshot(), maxCardsScannedPerSource: 30, maxSamplesPerSource: 5 });
    let nodeCalculationMs = Date.now() - nodeStarted;
    if (built.result.samples.length === 0 && env.enableTavily && deadline.has(80_000)) {
      await emit("searching_fallback", "No comparable primary samples found. Running one controlled fallback search.");
      const tavilyStarted = Date.now();
      setActivity({ provider: "Tavily", status: "running", calls: 1, durationMs: null });
      fallback = await captureTavilyPriceFallback({ profile, apiKey: env.tavilyApiKey, maxResultsToOpen: 2, signal: workflowSignal, getBrowserContext, costTracker: runCostTracker });
      setActivity({ provider: "Tavily", status: fallback.searchError ? "failed" : "fallback", calls: 1, durationMs: Date.now() - tavilyStarted, resultCount: fallback.candidates.length, cacheHit: false });
      nodeStarted = Date.now();
      built = buildPriceResult({ profile, snapshot, tavilyFallback: fallback, storeSnapshot: disabledStoreSnapshot(), maxCardsScannedPerSource: 30, maxSamplesPerSource: 5 });
      nodeCalculationMs += Date.now() - nodeStarted;
    } else setActivity({ provider: "Tavily", status: "skipped", calls: 0, durationMs: 0, resultCount: 0 });

    for (const provider of [...MARKETPLACE_SOURCE_IDS, "Tavily"] as const) {
      const current = activities.find((entry) => entry.provider === provider);
      if (current) setActivity({ ...current, validResultCount: built.result.samples.filter((sample) => sample.source === (provider === "Tavily" ? WEB_FALLBACK_SOURCE : provider)).length });
    }
    setActivity({ provider: "Node", status: "succeeded", calls: 0, durationMs: nodeCalculationMs, resultCount: built.result.samples.length, validResultCount: built.result.referenceRange.sampleCount });
    await emit("processing_prices", "Calculating the reference range in Node.js");

    const areas = recommendAreas(input.identification.category);
    const stores = verifiedStoreSuggestions([]);
    assertSafeRecommendations(areas, stores);
    const reference = built.result.referenceRange;
    const warnings = [...built.result.warnings];
    if (input.collectorMode && auctionSources.every((source) => source.comparableSignals === 0)) warnings.push("No comparable public active-auction signals were found. No additional auction search was attempted.");
    for (const source of auctionSources.filter((entry) => entry.status === "failed")) warnings.push(`${source.source} could not be read; the other sources and marketplace range are unaffected.`);
    if (!stores.length) warnings.push("No Tokyo physical store with verified source evidence is available yet. Use the area map search and confirm before visiting.");
    const qwen = activities.find((entry) => entry.provider === "Qwen");
    const result: AnalysisResult = {
      identification: input.identification,
      collectorMode: input.collectorMode,
      collectorEvidence: input.collectorMode ? input.collectorEvidence : null,
      auctionSources,
      priceReference: { currency: "JPY", low: reference.low, median: reference.median, high: reference.high, sampleCount: reference.sampleCount, samples: built.result.samples.map(({ title, price, currency, source, url, condition, versionMatch, packageStatus, includedInReferenceRange }) => ({ title, price, currency, source, url, condition, versionMatch, packageStatus, includedInReferenceRange })), disclaimer: "Online asking-price reference" },
      recommendedAreas: areas,
      storeSuggestions: stores,
      warnings,
      cost: { qwenCalls: qwen?.calls ?? 1, inputTokens: qwen?.inputTokens ?? 0, outputTokens: qwen?.outputTokens ?? 0, marketplacePages: marketplacePagesOpened, auctionPages: input.collectorMode ? 2 : 0, tavilyCalls: fallback.triggered ? 1 : 0, daytonaCalls: 0, totalMs: Date.now() - startedAt },
    };
    return { result, toolActivity: activities };
  } finally {
    await closeBrowserLease();
    if (costTracker) {
      const lease = await (browserLeasePromise as Promise<BrowserLease> | null)?.catch(() => null) ?? null;
      await persistMarketplaceCostRecords(costTracker.settleBrowserSession(lease?.session ?? closedBrowserSession));
    }
    deadline.close();
  }
}
