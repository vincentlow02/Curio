import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MARKETPLACE_IDS } from "../src/core/marketplace";
import { buildMarketplaceCostReport, readMarketplaceCostRecords } from "../src/server/analysis/marketplace-cost-report";
import { persistMarketplaceCostRecords } from "../src/server/analysis/marketplace-cost-store";
import { estimateBrowserlessTimeUnits } from "../src/server/browser/session-meter";
import { createTimeoutSignal } from "../src/server/providers/marketplaces/shared/http";
import { fetchWithHttpMetrics, observeBrowserPageRequests, parseVerifiedHttpCostRates, ResearchCostTracker, type BrowserSessionUsage } from "../src/server/analysis/marketplace-cost-tracker";
import type { MarketplaceCandidate } from "../src/price/types";
import type { Page, Request, Response as PlaywrightResponse } from "playwright-core";

function candidate(overrides: Partial<MarketplaceCandidate> = {}): MarketplaceCandidate {
  return {
    source: MARKETPLACE_IDS.rakuten,
    rank: 1,
    title: "Used PSP-3000 console",
    displayedPrice: 12000,
    url: "https://example.jp/item/psp-3000",
    shopName: "shop",
    availabilityText: "",
    ...overrides,
  };
}

function browserlessSession(durationMs: number, sessionId = "session-1"): BrowserSessionUsage {
  const endedAt = Date.now();
  return {
    sessionId,
    transport: "browserless",
    startedAt: new Date(endedAt - durationMs).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs,
    estimatedTimeUnits: estimateBrowserlessTimeUnits(durationMs),
    proxyCaptchaUnits: null,
    actualUnits: null,
    actualCostUSD: null,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Marketplace cost tracking", () => {
  it("composes a provider timeout with caller cancellation", () => {
    const controller = new AbortController();
    const signal = createTimeoutSignal(controller.signal, 10_000);

    expect(signal.aborted).toBe(false);
    controller.abort(new Error("research canceled"));
    expect(signal.aborted).toBe(true);
  });

  it("records an HTTP provider request, duration, response and valid products", async () => {
    let now = 1000;
    const tracker = new ResearchCostTracker("run-http", {
      now: () => now,
      formatTime: (timestamp) => new Date(timestamp).toISOString(),
      httpCostPerRequestUSD: { [MARKETPLACE_IDS.rakuten]: 0.025 },
    });
    const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.rakuten, "http");
    const response = await fetchWithHttpMetrics(
      async () => new Response("{}", { status: 200 }),
      "https://api.example.jp/search",
      { method: "GET" },
      {
        onRequest: () => undefined,
        onHttpRequestStarted: () => meter.requestStarted(true),
        onHttpRequestCompleted: (status, elapsedMs) => meter.requestCompleted(status, elapsedMs),
      },
    );
    now += 125;
    meter.finish({ candidates: [candidate(), candidate({ rank: 2, title: "", url: "relative" })] });
    const records = tracker.settleBrowserSession(null);
    const metric = records[0]!;

    expect(response.status).toBe(200);
    expect(metric).toMatchObject({
      kind: "provider_metric",
      providerId: MARKETPLACE_IDS.rakuten,
      transport: "http",
      elapsedMs: 125,
      status: "SUCCESS",
      httpRequestCount: 1,
      candidateCount: 2,
      validProductCount: 1,
      estimatedCostUSD: 0.025,
      actualCostUSD: null,
      costStatus: "ESTIMATED",
    });
    expect(metric.kind === "provider_metric" && metric.httpResponses[0]).toMatchObject({ status: 200, success: true });
  });

  it("reports Matcher pricing and reference samples separately from valid candidates", () => {
    const tracker = new ResearchCostTracker("run-pricing-counts", {
      httpCostPerRequestUSD: { [MARKETPLACE_IDS.rakuten]: 0.02 },
    });
    const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.rakuten, "http");
    meter.requestStarted(true);
    meter.requestCompleted(200, 4);
    meter.finish({ candidates: [candidate(), candidate({ rank: 2, title: "Another PSP-3000 listing", url: "https://example.jp/item/psp-3000-2" })] });
    tracker.setProviderPricingSampleCounts(MARKETPLACE_IDS.rakuten, 2, 1);
    const records = tracker.settleBrowserSession(null);
    const metric = records.find((record) => record.kind === "provider_metric");
    const [summary] = buildMarketplaceCostReport(records.filter((record) => record.kind === "provider_metric"));

    expect(metric).toMatchObject({ candidateCount: 2, validProductCount: 2, pricingSampleCount: 2, referenceSampleCount: 1 });
    expect(summary).toMatchObject({ totalValidProducts: 2, totalPricingSamples: 2, totalReferenceSamples: 1, estimatedUSD: 0.02, estimatedCostPerPricingSampleUSD: 0.01 });
  });

  it("counts Browser Page HTTP traffic without treating subrequests as billable API calls or persisting URLs", () => {
    const tracker = new ResearchCostTracker("run-browser-page");
    const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.mercari, "browser");
    const page = new EventEmitter() as unknown as Page;
    const request = { url: () => "https://example.jp/assets/private-looking-path", resourceType: () => "stylesheet" } as unknown as Request;
    const documentRequest = { url: () => "https://jp.mercari.com/search", resourceType: () => "document" } as unknown as Request;
    observeBrowserPageRequests(page, {
      onHttpRequestStarted: () => meter.requestStarted(),
      onHttpRequestCompleted: (status, elapsedMs, blockingRelevant) => meter.requestCompleted(status, elapsedMs, blockingRelevant),
    });
    page.emit("request", request);
    page.emit("response", { request: () => request, status: () => 403 } as unknown as PlaywrightResponse);
    page.emit("request", documentRequest);
    page.emit("response", { request: () => documentRequest, status: () => 200 } as unknown as PlaywrightResponse);
    meter.pageOpened();
    meter.finish({ candidates: [candidate({ source: MARKETPLACE_IDS.mercari })] });
    const record = tracker.settleBrowserSession(null).find((entry) => entry.kind === "provider_metric");

    expect(record).toMatchObject({ httpRequestCount: 2, apiRequestCount: 0, browserPageCount: 1, status: "SUCCESS", errorCategory: null });
    expect(JSON.stringify(record)).not.toContain("private-looking-path");
  });

  it("estimates one unit at 30 seconds and two at 31 seconds", () => {
    expect(estimateBrowserlessTimeUnits(30_000)).toBe(1);
    expect(estimateBrowserlessTimeUnits(31_000)).toBe(2);
  });

  it("accepts only explicitly verified configurable request rates", () => {
    const rates = parseVerifiedHttpCostRates(JSON.stringify({
      "Rakuten": { usdPerRequest: 0.02, verified: true },
      "Yahoo! Shopping": { usdPerRequest: 0.01, verified: false },
      Mercari: 0.03,
    }));
    expect(rates).toEqual({ [MARKETPLACE_IDS.rakuten]: 0.02 });
  });

  it("keeps Browserless dollars unknown when a unit rate is not verified", () => {
    const previousRate = process.env.BROWSERLESS_COST_PER_TIME_UNIT_USD;
    const previousVerified = process.env.BROWSERLESS_COST_RATE_VERIFIED;
    process.env.BROWSERLESS_COST_PER_TIME_UNIT_USD = "0.08";
    process.env.BROWSERLESS_COST_RATE_VERIFIED = "false";
    try {
      const tracker = new ResearchCostTracker("run-unverified-browser-rate");
      const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.mercari, "browser");
      meter.pageOpened();
      meter.finish({ candidates: [candidate({ source: MARKETPLACE_IDS.mercari })] });
      const records = tracker.settleBrowserSession(browserlessSession(30_000));
      const provider = records.find((record) => record.kind === "provider_metric");
      const session = records.find((record) => record.kind === "browser_session_metric");

      expect(provider).toMatchObject({ estimatedBrowserlessUnits: 1, estimatedCostUSD: null, actualCostUSD: null, costStatus: "UNKNOWN" });
      expect(session).toMatchObject({ estimatedTimeUnits: 1, estimatedCostUSD: null, actualCostUSD: null, costStatus: "UNKNOWN" });
    } finally {
      if (previousRate === undefined) delete process.env.BROWSERLESS_COST_PER_TIME_UNIT_USD;
      else process.env.BROWSERLESS_COST_PER_TIME_UNIT_USD = previousRate;
      if (previousVerified === undefined) delete process.env.BROWSERLESS_COST_RATE_VERIFIED;
      else process.env.BROWSERLESS_COST_RATE_VERIFIED = previousVerified;
    }
  });

  it("allocates one shared session once across Marketplace and non-Marketplace providers", () => {
    const tracker = new ResearchCostTracker("run-shared", { browserlessCostPerTimeUnitUSD: 0.1 });
    const mercari = tracker.beginProviderSearch(MARKETPLACE_IDS.mercari, "browser");
    const rakuten = tracker.beginProviderSearch(MARKETPLACE_IDS.rakuten, "browser");
    const auction = tracker.beginProviderSearch("Yahoo Auctions", "browser");
    const fallback = tracker.beginProviderSearch("Web fallback", "mixed");
    mercari.pageOpened();
    rakuten.pageOpened();
    auction.pageOpened();
    auction.pageOpened();
    fallback.pageOpened();
    for (const meter of [mercari, rakuten, auction, fallback]) meter.finish({ candidates: [candidate()] });

    const records = tracker.settleBrowserSession(browserlessSession(61_000, "shared-session"));
    const providerRecords = records.filter((record) => record.kind === "provider_metric");
    const sessionRecord = records.find((record) => record.kind === "browser_session_metric");
    const allocated = providerRecords.reduce((sum, record) => sum + (record.estimatedBrowserlessUnits ?? 0), 0);

    expect(sessionRecord).toMatchObject({ estimatedTimeUnits: 3, actualUnits: null, actualCostUSD: null, estimatedCostUSD: 0.3 });
    expect(sessionRecord?.kind === "browser_session_metric" ? sessionRecord.providerAllocations : {}).toEqual({
      [MARKETPLACE_IDS.mercari]: 0.6,
      [MARKETPLACE_IDS.rakuten]: 0.6,
      "Yahoo Auctions": 1.2,
      "Web fallback": 0.6,
    });
    expect(allocated).toBeCloseTo(3);
    expect(providerRecords.filter((record) => record.kind === "provider_metric").reduce((sum, record) => sum + (record.estimatedCostUSD ?? 0), 0)).toBeCloseTo(0.3);
    expect(providerRecords.every((record) => record.actualCostUSD === null && record.costStatus === "ESTIMATED")).toBe(true);
  });

  it("records empty and blocked searches with elapsed time while leaving unverified actual cost unknown", () => {
    let now = 10_000;
    const tracker = new ResearchCostTracker("run-empty-failed", {
      now: () => now,
      formatTime: (timestamp) => new Date(timestamp).toISOString(),
    });
    const empty = tracker.beginProviderSearch(MARKETPLACE_IDS.mercari, "browser");
    empty.pageOpened();
    now += 70;
    empty.finish({ candidates: [] });
    const blocked = tracker.beginProviderSearch("Yahoo Auctions", "browser");
    blocked.pageOpened();
    blocked.requestStarted();
    blocked.requestCompleted(403, 12);
    now += 30;
    blocked.finish({ candidates: [], error: "HTTP 403" });

    const records = tracker.settleBrowserSession(null).filter((record) => record.kind === "provider_metric");
    expect(records.map(({ status }) => status)).toEqual(["EMPTY", "BLOCKED"]);
    expect(records.map(({ elapsedMs }) => elapsedMs)).toEqual([70, 30]);
    expect(records.every((record) => record.actualCostUSD === null && record.costStatus === "UNKNOWN")).toBe(true);
  });

  it("exposes access and rate restrictions for pipeline fallback decisions", () => {
    const tracker = new ResearchCostTracker("run-restriction-gate");
    const blocked = tracker.beginProviderSearch(MARKETPLACE_IDS.mercari, "browser");
    blocked.requestStarted();
    blocked.requestCompleted(403, 12, false);
    blocked.finish({ candidates: [] });
    expect(tracker.hasAccessRestriction).toBe(true);

    const clearTracker = new ResearchCostTracker("run-no-restriction");
    const clear = clearTracker.beginProviderSearch(MARKETPLACE_IDS.rakuma, "http");
    clear.requestStarted(true);
    clear.requestCompleted(200, 8);
    clear.finish({ candidates: [candidate({ source: MARKETPLACE_IDS.rakuma })] });
    expect(clearTracker.hasAccessRestriction).toBe(false);
  });

  it("settles once, preserves the first result, and leaves unowned session units Unattributed", () => {
    const tracker = new ResearchCostTracker("run-idempotent");
    const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.mercari, "browser");
    meter.finish({ candidates: [candidate()] });
    meter.finish({ error: "later failure" });
    const session = browserlessSession(30_000, "unattributed-session");
    const first = tracker.settleBrowserSession(session);

    expect(first.find((record) => record.kind === "provider_metric")?.status).toBe("SUCCESS");
    expect(first.find((record) => record.kind === "browser_session_metric")?.kind === "browser_session_metric"
      ? first.find((record) => record.kind === "browser_session_metric")?.providerAllocations
      : null).toEqual({ Unattributed: 1 });
    expect(tracker.settleBrowserSession(session)).toEqual([]);
  });

  it("reports recorded totals and N/A cost per valid product when no valid products exist", () => {
    const tracker = new ResearchCostTracker("run-report", { httpCostPerRequestUSD: { [MARKETPLACE_IDS.rakuten]: 0.01 } });
    const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.rakuten, "http");
    meter.requestStarted(true);
    meter.requestCompleted(200, 4);
    meter.finish({ candidates: [] });
    const providerRecords = tracker.settleBrowserSession(null).filter((record) => record.kind === "provider_metric");
    const [row] = buildMarketplaceCostReport(providerRecords);

    expect(row).toMatchObject({ totalSearches: 1, empty: 1, totalHttpRequests: 1, totalApiCalls: 1, totalCandidates: 0, totalValidProducts: 0, estimatedUSD: 0.01, actualUSD: null, estimatedBrowserlessUnits: 0 });
    expect(row?.estimatedCostPerValidProductUSD).toBeNull();
  });

  it("persists and reports actual tracker records from a local JSONL file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "curio-cost-report-"));
    const path = join(directory, "metrics.jsonl");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const tracker = new ResearchCostTracker("run-persist", { httpCostPerRequestUSD: { [MARKETPLACE_IDS.rakuten]: 0.02 } });
      const meter = tracker.beginProviderSearch(MARKETPLACE_IDS.rakuten, "http");
      meter.requestStarted(true);
      meter.requestCompleted(200, 10);
      meter.finish({ candidates: [candidate({ source: MARKETPLACE_IDS.rakuten })] });
      const records = tracker.settleBrowserSession(null);
      await persistMarketplaceCostRecords(records, (jsonl) => appendFile(path, jsonl, "utf8"));
      const loaded = await readMarketplaceCostRecords(path);
      const rows = buildMarketplaceCostReport(loaded.filter((record) => record.kind === "provider_metric"));

      expect(log).toHaveBeenCalledTimes(1);
      expect(rows[0]).toMatchObject({ totalSearches: 1, totalHttpRequests: 1, totalApiCalls: 1, totalCandidates: 1, totalValidProducts: 1, estimatedUSD: 0.02, actualUSD: null });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
