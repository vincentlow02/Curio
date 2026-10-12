import type { MarketplaceCandidate } from "../../price/types";
import type { Page, Request } from "playwright-core";
import { estimateBrowserlessTimeUnits } from "../browser/session-meter";
import type { BrowserSessionUsage } from "../browser/session-meter";
import type { HttpRequestMetricHooks } from "../providers/marketplaces/shared/http";

export { fetchWithHttpMetrics } from "../providers/marketplaces/shared/http";
export type { HttpRequestMetricHooks } from "../providers/marketplaces/shared/http";

export { estimateBrowserlessTimeUnits } from "../browser/session-meter";

export type ProviderTransport = "http" | "browser" | "mixed";
export type ProviderMetricStatus = "SUCCESS" | "EMPTY" | "FAILED" | "BLOCKED" | "TIMEOUT";
export type MetricCostStatus = "ACTUAL" | "ESTIMATED" | "UNKNOWN";
export type MetricErrorCategory = "TIMEOUT" | "ACCESS_RESTRICTED" | "CONFIGURATION" | "NETWORK" | "UPSTREAM" | "INVALID_RESPONSE" | "OTHER";

export type HttpResponseMetric = { status: number | null; elapsedMs: number; success: boolean; blockingRelevant: boolean };

export type ProviderMetricRecord = {
  kind: "provider_metric";
  schemaVersion: 1;
  researchRunId: string;
  providerId: string;
  transport: ProviderTransport;
  startedAt: string;
  elapsedMs: number;
  status: ProviderMetricStatus;
  httpRequestCount: number;
  apiRequestCount: number;
  httpResponses: HttpResponseMetric[];
  browserPageCount: number;
  candidateCount: number;
  validProductCount: number;
  pricingSampleCount?: number | null;
  referenceSampleCount?: number | null;
  errorCategory: MetricErrorCategory | null;
  estimatedBrowserlessUnits: number | null;
  estimatedCostUSD: number | null;
  actualCostUSD: number | null;
  costStatus: MetricCostStatus;
  persistenceScope: "local-filesystem-nondurable";
};

export type BrowserSessionMetricRecord = {
  kind: "browser_session_metric";
  schemaVersion: 1;
  researchRunId: string;
  sessionId: string;
  transport: "browserless" | "local";
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  estimatedTimeUnits: number | null;
  proxyCaptchaUnits: number | null;
  actualUnits: number | null;
  estimatedCostUSD: number | null;
  actualCostUSD: number | null;
  costStatus: MetricCostStatus;
  providerAllocations: Record<string, number>;
  persistenceScope: "local-filesystem-nondurable";
};

export type CostMetricRecord = ProviderMetricRecord | BrowserSessionMetricRecord;

export function validProductCount(candidates: readonly MarketplaceCandidate[]): number {
  return candidates.filter((candidate) => {
    if (!candidate.title.trim() || candidate.displayedPrice === null || !Number.isFinite(candidate.displayedPrice) || candidate.displayedPrice <= 0) return false;
    try {
      const url = new URL(candidate.url);
      return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }).length;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function errorCategory(error: string | null, statuses: readonly (number | null)[]): MetricErrorCategory | null {
  const message = error?.toLowerCase() ?? "";
  if (statuses.includes(408) || statuses.includes(504) || /timeout|timed out|deadline/.test(message)) return "TIMEOUT";
  if ([401, 403, 407, 429].some((status) => statuses.includes(status)) || /captcha|access denied|blocked|forbidden|rate.?limit/.test(message)) return "ACCESS_RESTRICTED";
  if (/configuration|not configured|missing credentials/.test(message)) return "CONFIGURATION";
  if (/network|fetch failed|connection|socket/.test(message)) return "NETWORK";
  if (/invalid response|malformed json/.test(message)) return "INVALID_RESPONSE";
  if (error) return /upstream|http 5\d\d/.test(message) ? "UPSTREAM" : "OTHER";
  return null;
}

function statusFor(error: string | null, candidateCount: number, category: MetricErrorCategory | null): ProviderMetricStatus {
  if (category === "TIMEOUT") return "TIMEOUT";
  if (category === "ACCESS_RESTRICTED") return "BLOCKED";
  if (error) return "FAILED";
  return candidateCount === 0 ? "EMPTY" : "SUCCESS";
}

export type ProviderMetricFinish = {
  candidates?: readonly MarketplaceCandidate[];
  candidateCount?: number;
  validProductCount?: number;
  error?: string | null;
};

export class ProviderSearchMeter {
  readonly startedAt: string;
  private readonly startedAtMs: number;
  private finalized = false;
  private requests = 0;
  private apiRequests = 0;
  private pages = 0;
  private readonly responses: HttpResponseMetric[] = [];
  private candidateCount = 0;
  private validCount = 0;
  private pricingSampleCount: number | null = null;
  private referenceSampleCount: number | null = null;
  private category: MetricErrorCategory | null = null;
  private providerStatus: ProviderMetricStatus = "EMPTY";
  private elapsed = 0;

  constructor(
    readonly researchRunId: string,
    readonly providerId: string,
    readonly transport: ProviderTransport,
    private readonly now: () => number,
    private readonly formatTime: (timestamp: number) => string,
  ) {
    this.startedAtMs = now();
    this.startedAt = formatTime(this.startedAtMs);
  }

  requestStarted(isBillableApiRequest = false): void {
    this.requests += 1;
    if (isBillableApiRequest) this.apiRequests += 1;
  }
  requestCompleted(status: number | null, elapsedMs: number, blockingRelevant = true): void {
    this.responses.push({ status, elapsedMs: Math.max(0, Math.round(elapsedMs)), success: status !== null && status >= 200 && status < 400, blockingRelevant });
  }
  pageOpened(): void { this.pages += 1; }

  finish(input: ProviderMetricFinish = {}): void {
    if (this.finalized) return;
    this.candidateCount = input.candidates?.length ?? input.candidateCount ?? 0;
    this.validCount = input.candidates ? validProductCount(input.candidates) : input.validProductCount ?? 0;
    this.category = errorCategory(input.error ?? null, this.responses.filter((response) => response.blockingRelevant).map((response) => response.status));
    this.providerStatus = statusFor(input.error ?? null, this.candidateCount, this.category);
    this.elapsed = Math.max(0, Math.round(this.now() - this.startedAtMs));
    this.finalized = true;
  }

  setPricingSampleCounts(pricingSampleCount: number, referenceSampleCount: number): void {
    this.pricingSampleCount = Math.max(0, Math.floor(pricingSampleCount));
    this.referenceSampleCount = Math.max(0, Math.min(Math.floor(referenceSampleCount), this.pricingSampleCount));
  }

  get browserPageCount(): number { return this.pages; }
  get httpRequestCount(): number { return this.requests; }
  get apiRequestCount(): number { return this.apiRequests; }
  get isFinished(): boolean { return this.finalized; }
  get hasAccessRestriction(): boolean {
    return this.responses.some((response) => [401, 403, 407, 429].includes(response.status ?? 0));
  }

  createRecord(estimatedBrowserlessUnits: number | null, estimatedCostUSD: number | null, costStatus: MetricCostStatus): ProviderMetricRecord {
    return {
      kind: "provider_metric",
      schemaVersion: 1,
      researchRunId: this.researchRunId,
      providerId: this.providerId,
      transport: this.transport,
      startedAt: this.startedAt,
      elapsedMs: this.elapsed,
      status: this.providerStatus,
      httpRequestCount: this.requests,
      apiRequestCount: this.apiRequests,
      httpResponses: [...this.responses],
      browserPageCount: this.pages,
      candidateCount: this.candidateCount,
      validProductCount: this.validCount,
      pricingSampleCount: this.pricingSampleCount,
      referenceSampleCount: this.referenceSampleCount,
      errorCategory: this.category,
      estimatedBrowserlessUnits,
      estimatedCostUSD,
      actualCostUSD: null,
      costStatus,
      persistenceScope: "local-filesystem-nondurable",
    };
  }
}

export type CostTrackerOptions = {
  now?: () => number;
  formatTime?: (timestamp: number) => string;
  httpCostPerRequestUSD?: Readonly<Record<string, number>>;
  browserlessCostPerTimeUnitUSD?: number | null;
};

export class ResearchCostTracker {
  private readonly meters: ProviderSearchMeter[] = [];
  private readonly now: () => number;
  private readonly formatTime: (timestamp: number) => string;
  private readonly httpRates: Readonly<Record<string, number>>;
  private readonly browserlessRate: number | null;
  private settledSessionIds = new Set<string>();
  private settledWithoutSession = false;

  constructor(readonly researchRunId: string, options: CostTrackerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.formatTime = options.formatTime ?? ((timestamp) => new Date(timestamp).toISOString());
    this.httpRates = options.httpCostPerRequestUSD !== undefined ? options.httpCostPerRequestUSD : configuredHttpRates();
    this.browserlessRate = options.browserlessCostPerTimeUnitUSD !== undefined ? options.browserlessCostPerTimeUnitUSD : configuredBrowserlessRate();
  }

  beginProviderSearch(providerId: string, transport: ProviderTransport): ProviderSearchMeter {
    const meter = new ProviderSearchMeter(this.researchRunId, providerId, transport, this.now, this.formatTime);
    this.meters.push(meter);
    return meter;
  }

  get hasAccessRestriction(): boolean {
    return this.meters.some((meter) => meter.hasAccessRestriction);
  }

  setProviderPricingSampleCounts(providerId: string, pricingSampleCount: number, referenceSampleCount: number): void {
    for (const meter of this.meters) {
      if (meter.providerId === providerId) meter.setPricingSampleCounts(pricingSampleCount, referenceSampleCount);
    }
  }

  settleBrowserSession(session: BrowserSessionUsage | null): CostMetricRecord[] {
    if (session) {
      if (this.settledSessionIds.has(session.sessionId)) return [];
      this.settledSessionIds.add(session.sessionId);
    } else {
      if (this.settledWithoutSession) return [];
      this.settledWithoutSession = true;
    }
    for (const meter of this.meters) {
      if (!meter.isFinished) meter.finish({ error: "Provider search did not complete." });
    }
    const units = session?.transport === "browserless" ? session.estimatedTimeUnits ?? estimateBrowserlessTimeUnits(session.durationMs ?? 0) : null;
    const totalPages = this.meters.reduce((sum, meter) => sum + meter.browserPageCount, 0);
    const allocations: Record<string, number> = {};
    if (units !== null) {
      if (totalPages === 0) allocations.Unattributed = units;
      else {
        for (const meter of this.meters) {
          if (meter.browserPageCount > 0) allocations[meter.providerId] = (allocations[meter.providerId] ?? 0) + units * meter.browserPageCount / totalPages;
        }
      }
    }

    const providerRecords = this.meters.map((meter) => {
      const allocatedUnits = session?.transport === "browserless" && meter.browserPageCount > 0
        ? units! * meter.browserPageCount / totalPages
        : null;
      const estimatedCost = this.estimateProviderCost(meter, allocatedUnits);
      return meter.createRecord(allocatedUnits, estimatedCost.value, estimatedCost.status);
    });
    const sessionEstimate = session?.transport === "browserless" && units !== null && this.browserlessRate !== null
      ? roundUsd(units * this.browserlessRate)
      : null;
    const sessionRecord: BrowserSessionMetricRecord | null = session ? {
      kind: "browser_session_metric",
      schemaVersion: 1,
      researchRunId: this.researchRunId,
      sessionId: session.sessionId,
      transport: session.transport,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMs: session.durationMs,
      estimatedTimeUnits: units,
      proxyCaptchaUnits: session.proxyCaptchaUnits,
      actualUnits: session.actualUnits,
      estimatedCostUSD: sessionEstimate,
      actualCostUSD: session.actualCostUSD,
      costStatus: session.actualCostUSD !== null ? "ACTUAL" : sessionEstimate !== null ? "ESTIMATED" : "UNKNOWN",
      providerAllocations: allocations,
      persistenceScope: "local-filesystem-nondurable",
    } : null;
    return sessionRecord ? [...providerRecords, sessionRecord] : providerRecords;
  }

  private estimateProviderCost(meter: ProviderSearchMeter, browserUnits: number | null): { value: number | null; status: MetricCostStatus } {
    let total = 0;
    let hasBillableUsage = false;
    if (meter.transport === "http" || meter.transport === "mixed") {
      if (meter.apiRequestCount > 0) {
        const rate = this.httpRates[meter.providerId];
        if (rate === undefined) return { value: null, status: "UNKNOWN" };
        total += meter.apiRequestCount * rate;
        hasBillableUsage = true;
      }
    }
    if (browserUnits !== null) {
      if (this.browserlessRate === null) return { value: null, status: "UNKNOWN" };
      total += browserUnits * this.browserlessRate;
      hasBillableUsage = true;
    }
    return hasBillableUsage ? { value: roundUsd(total), status: "ESTIMATED" } : { value: null, status: "UNKNOWN" };
  }
}

export function observeBrowserPageRequests(page: Page, hooks: Pick<HttpRequestMetricHooks, "onHttpRequestStarted" | "onHttpRequestCompleted">): void {
  if (typeof page.on !== "function") return;
  const startedAtByRequest = new Map<Request, number>();
  const complete = (request: Request, status: number | null): void => {
    const startedAt = startedAtByRequest.get(request);
    if (startedAt === undefined) return;
    startedAtByRequest.delete(request);
    hooks.onHttpRequestCompleted?.(status, performance.now() - startedAt, request.resourceType() === "document");
  };
  page.on("request", (request) => {
    try {
      const protocol = new URL(request.url()).protocol;
      if (protocol !== "http:" && protocol !== "https:") return;
      startedAtByRequest.set(request, performance.now());
      hooks.onHttpRequestStarted?.();
    } catch {
      return;
    }
  });
  page.on("response", (response) => complete(response.request(), response.status()));
  page.on("requestfailed", (request) => complete(request, null));
}

function configuredRate(value: string | undefined): number | null {
  if (value === undefined || !value.trim()) return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : null;
}

function configuredBrowserlessRate(): number | null {
  return process.env.BROWSERLESS_COST_RATE_VERIFIED === "true"
    ? configuredRate(process.env.BROWSERLESS_COST_PER_TIME_UNIT_USD)
    : null;
}

function configuredHttpRates(): Readonly<Record<string, number>> {
  return parseVerifiedHttpCostRates(process.env.MARKETPLACE_HTTP_COST_RATES_JSON);
}

export function parseVerifiedHttpCostRates(configuration: string | undefined): Readonly<Record<string, number>> {
  try {
    const parsed: unknown = JSON.parse(configuration ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([providerId, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const rate = value as { usdPerRequest?: unknown; verified?: unknown };
      return rate.verified === true && typeof rate.usdPerRequest === "number" && Number.isFinite(rate.usdPerRequest) && rate.usdPerRequest >= 0
        ? [[providerId, rate.usdPerRequest]]
        : [];
    }));
  } catch {
    return {};
  }
}
