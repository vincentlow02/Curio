import type {
  AnalysisResult,
  AnalysisStage,
  ResearchStreamEvent,
  ToolActivity,
} from "../../../core/analysis/types";
import { isCollectibleCategory } from "../../../core/profile/types";

export type ResearchStreamErrorKind =
  | "invalid-json"
  | "invalid-event-shape"
  | "invalid-required-field"
  | "invalid-status"
  | "stream-read";

export class ResearchStreamError extends Error {
  constructor(readonly kind: ResearchStreamErrorKind) {
    super(researchStreamErrorMessage(kind));
    this.name = "ResearchStreamError";
  }
}

export type ResearchStreamValidationResult =
  | { kind: "valid"; event: ResearchStreamEvent }
  | { kind: "unknown-event-type" }
  | { kind: "invalid-event-shape" }
  | { kind: "invalid-required-field" }
  | { kind: "invalid-status" };

export type ResearchStreamOptions = {
  signal?: AbortSignal;
  onEvent?: (event: ResearchStreamEvent) => void;
};

export type ResearchStreamConsumer = (
  stream: ReadableStream<Uint8Array>,
  options?: ResearchStreamOptions,
) => Promise<void>;

const analysisStages: readonly AnalysisStage[] = [
  "queued",
  "identifying",
  "identified",
  "queued_research",
  "needs_review",
  "searching_marketplaces",
  "searching_auctions",
  "searching_fallback",
  "processing_prices",
  "completed",
  "failed",
];
const toolProviders = ["Qwen", "Rakuten", "Mercari", "Yahoo Auctions", "Mandarake Auction", "Tavily", "Node", "Daytona"] as const;
const toolStatuses = ["pending", "running", "succeeded", "failed", "skipped", "fallback"] as const;
const verificationStatuses = ["not_run", "verified", "mismatch", "unavailable"] as const;
const auctionSources = ["Yahoo Auctions", "Mandarake Auction"] as const;
const auctionStatuses = ["succeeded", "no_results", "failed", "skipped"] as const;
const priceSources = ["Rakuten", "Mercari", "Web fallback"] as const;
const conditions = ["used", "new", "unknown"] as const;
const versionMatches = ["exact", "similar"] as const;
const packageStatuses = ["with_box", "without_box", "unknown"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

function isToolActivity(value: unknown): value is ToolActivity {
  if (!isRecord(value)
    || !isOneOf(value.provider, toolProviders)
    || !isOneOf(value.status, toolStatuses)
    || !isFiniteNumber(value.calls)
    || !isNullableNumber(value.durationMs)) return false;

  const optionalStrings = ["model"] as const;
  if (optionalStrings.some((key) => value[key] !== undefined && !isString(value[key]))) return false;

  const optionalNumbers = ["inputTokens", "outputTokens", "resultCount", "validResultCount"] as const;
  if (optionalNumbers.some((key) => value[key] !== undefined && !isFiniteNumber(value[key]))) return false;

  return (value.fallbackUsed === undefined || typeof value.fallbackUsed === "boolean")
    && (value.verificationStatus === undefined || isOneOf(value.verificationStatus, verificationStatuses))
    && (value.cacheHit === undefined || typeof value.cacheHit === "boolean");
}

function isToolActivityArray(value: unknown): value is ToolActivity[] {
  return Array.isArray(value) && value.every(isToolActivity);
}

function isCollectorEvidence(value: unknown): boolean {
  return value === null || (isRecord(value)
    && isStringArray(value.editionSignals)
    && isStringArray(value.conditionSignals)
    && isStringArray(value.visibleIdentifiers)
    && isStringArray(value.missingEvidence));
}

function isDetectionResult(value: unknown): boolean {
  if (!isRecord(value)
    || !isString(value.itemName)
    || !value.itemName.trim()
    || !isString(value.version)
    || !value.version.trim()
    || !isString(value.priceSearchKeywordJa)
    || !value.priceSearchKeywordJa.trim()
    || !isCollectibleCategory(value.category)) return false;

  if (value.pokemonCard === undefined) return true;
  const card = value.pokemonCard;
  return value.category === "Cards & Game Collectibles"
    && isRecord(card)
    && ["cardName", "cardNumber", "setCode", "setName", "rarity", "edition", "grade"].every(
      (key) => isString(card[key]) && card[key].trim().length > 0,
    )
    && isOneOf(card.language, ["Japanese", "English", "unknown"])
    && isOneOf(card.gradingCompany, ["PSA", "BGS", "CGC", "ungraded", "unknown"]);
}

function isAuctionSignal(value: unknown): boolean {
  return isRecord(value)
    && isOneOf(value.source, auctionSources)
    && isString(value.title)
    && isNullableNumber(value.currentPrice)
    && isNullableNumber(value.startingPrice)
    && isNullableNumber(value.buyNowPrice)
    && isNullableNumber(value.bidCount)
    && isString(value.remainingTime)
    && isString(value.conditionText)
    && isStringArray(value.matchedEvidence)
    && isStringArray(value.unresolvedDifferences)
    && isString(value.url);
}

function isAuctionSourceSummary(value: unknown): boolean {
  return isRecord(value)
    && isOneOf(value.source, auctionSources)
    && isOneOf(value.status, auctionStatuses)
    && isFiniteNumber(value.candidatesSeen)
    && isFiniteNumber(value.comparableSignals)
    && Array.isArray(value.signals)
    && value.signals.every(isAuctionSignal);
}

function isPriceSample(value: unknown): boolean {
  return isRecord(value)
    && isString(value.title)
    && isFiniteNumber(value.price)
    && value.currency === "JPY"
    && isOneOf(value.source, priceSources)
    && isString(value.url)
    && isOneOf(value.condition, conditions)
    && isOneOf(value.versionMatch, versionMatches)
    && isOneOf(value.packageStatus, packageStatuses)
    && typeof value.includedInReferenceRange === "boolean";
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)
    || !isDetectionResult(value.identification)
    || typeof value.collectorMode !== "boolean"
    || !isCollectorEvidence(value.collectorEvidence)
    || !Array.isArray(value.auctionSources)
    || !value.auctionSources.every(isAuctionSourceSummary)
    || !isRecord(value.priceReference)
    || value.priceReference.currency !== "JPY"
    || !isNullableNumber(value.priceReference.low)
    || !isNullableNumber(value.priceReference.median)
    || !isNullableNumber(value.priceReference.high)
    || !isFiniteNumber(value.priceReference.sampleCount)
    || !Array.isArray(value.priceReference.samples)
    || !value.priceReference.samples.every(isPriceSample)
    || value.priceReference.disclaimer !== "Online asking-price reference"
    || !Array.isArray(value.recommendedAreas)
    || !value.recommendedAreas.every((area) => isRecord(area)
      && isString(area.area)
      && isString(area.reason)
      && isString(area.searchKeywordJa))
    || !Array.isArray(value.storeSuggestions)
    || !value.storeSuggestions.every((store) => isRecord(store)
      && isString(store.name)
      && isString(store.reason)
      && isString(store.sourceUrl))
    || !isStringArray(value.warnings)
    || !isRecord(value.cost)) return false;

  const cost = value.cost;
  return ["qwenCalls", "inputTokens", "outputTokens", "marketplacePages", "auctionPages", "tavilyCalls", "daytonaCalls", "totalMs"]
    .every((key) => isFiniteNumber(cost[key]));
}

export function validateResearchStreamEvent(value: unknown): ResearchStreamValidationResult {
  if (!isRecord(value) || !isString(value.type) || !value.type.trim()) {
    return { kind: "invalid-event-shape" };
  }

  switch (value.type) {
    case "stage":
      if (!isOneOf(value.status, analysisStages)) return { kind: "invalid-status" };
      if (!isString(value.message) || !isToolActivityArray(value.toolActivity)) {
        return { kind: "invalid-required-field" };
      }
      return { kind: "valid", event: value as Extract<ResearchStreamEvent, { type: "stage" }> };
    case "completed":
      if (value.status !== "completed") return { kind: "invalid-status" };
      if (!isAnalysisResult(value.result) || !isToolActivityArray(value.toolActivity)) {
        return { kind: "invalid-required-field" };
      }
      return { kind: "valid", event: value as Extract<ResearchStreamEvent, { type: "completed" }> };
    case "error":
      if (value.status !== "failed") return { kind: "invalid-status" };
      if (!isString(value.error) || !value.error.trim()) return { kind: "invalid-required-field" };
      return { kind: "valid", event: value as Extract<ResearchStreamEvent, { type: "error" }> };
    default:
      return { kind: "unknown-event-type" };
  }
}

function researchStreamErrorMessage(kind: ResearchStreamErrorKind): string {
  switch (kind) {
    case "invalid-json":
      return "The research stream contained invalid JSON.";
    case "invalid-event-shape":
      return "The research stream contained an invalid event.";
    case "invalid-required-field":
      return "The research stream event was missing required data.";
    case "invalid-status":
      return "The research stream contained an invalid status.";
    case "stream-read":
      return "The research stream could not be read.";
  }
}

function parseLine(line: string, onEvent: (event: ResearchStreamEvent) => void): void {
  const content = line.trim();
  if (!content) return;

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new ResearchStreamError("invalid-json");
  }

  const validation = validateResearchStreamEvent(value);
  if (validation.kind === "unknown-event-type") return;
  if (validation.kind !== "valid") throw new ResearchStreamError(validation.kind);
  onEvent(validation.event);
}

async function readResearchStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ResearchStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw createAbortError();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let cancelled = false;
  const cancelReader = (): void => {
    if (cancelled) return;
    cancelled = true;
    void reader.cancel().catch(() => undefined);
  };
  const onAbort = (): void => cancelReader();

  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw createAbortError();
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        if (signal?.aborted) throw createAbortError();
        throw new ResearchStreamError("stream-read");
      }
      if (signal?.aborted) throw createAbortError();

      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      if (chunk.done) {
        buffer += decoder.decode();
        if (signal?.aborted) throw createAbortError();
        parseLine(buffer, onEvent);
        completed = true;
        return;
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (signal?.aborted) throw createAbortError();
        parseLine(line, onEvent);
      }
    }
  } catch (error) {
    if (!completed) cancelReader();
    if (signal?.aborted) throw createAbortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function consumeResearchStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ResearchStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return readResearchStream(stream, onEvent, signal);
}
