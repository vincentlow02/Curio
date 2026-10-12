import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { MARKETPLACE_SOURCE_IDS, type MarketplaceSource } from "../../core/marketplace";
import type { CostMetricRecord, ProviderMetricRecord } from "./marketplace-cost-tracker";
import { MARKETPLACE_COST_METRICS_FILE } from "./marketplace-cost-store";

export function marketplaceMetricsPath(path?: string): string {
  return resolve(path?.trim() || MARKETPLACE_COST_METRICS_FILE);
}

export async function readMarketplaceCostRecords(path?: string): Promise<CostMetricRecord[]> {
  const contents = await readFile(marketplaceMetricsPath(path), "utf8");
  const records: CostMetricRecord[] = [];
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isCostMetricRecord(value)) records.push(value);
    } catch {
      continue;
    }
  }
  return records;
}

export type MarketplaceCostSummary = {
  providerId: MarketplaceSource;
  totalSearches: number;
  success: number;
  failure: number;
  empty: number;
  totalTimeMs: number;
  averageTimeMs: number;
  totalHttpRequests: number;
  totalApiCalls: number;
  totalCandidates: number;
  totalValidProducts: number;
  totalValidMatchingCandidates: number;
  totalUniqueSellers: number;
  totalIncrementalPricingSamples: number;
  incrementalPricingSamplesBySellerId: Record<string, number>;
  totalFailedRequests: number;
  totalBlockedRequests: number;
  totalPricingSamples: number | null;
  totalReferenceSamples: number | null;
  estimatedBrowserlessUnits: number;
  estimatedUSD: number | null;
  actualUSD: number | null;
  estimatedCostPerValidProductUSD: number | null;
  estimatedCostPerPricingSampleUSD: number | null;
};

export function buildMarketplaceCostReport(records: readonly ProviderMetricRecord[]): MarketplaceCostSummary[] {
  const marketplaceRecords = records.filter((record): record is ProviderMetricRecord & { providerId: MarketplaceSource } =>
    MARKETPLACE_SOURCE_IDS.includes(record.providerId as MarketplaceSource),
  );
  const providerIds = [...new Set(marketplaceRecords.map((record) => record.providerId))];
  return providerIds.map((providerId) => {
    const providerRecords = marketplaceRecords.filter((record) => record.providerId === providerId);
    const totalSearches = providerRecords.length;
    const totalTimeMs = providerRecords.reduce((sum, record) => sum + record.elapsedMs, 0);
    const totalValidProducts = providerRecords.reduce((sum, record) => sum + record.validProductCount, 0);
    const incrementalPricingSamplesBySellerId: Record<string, number> = {};
    for (const record of providerRecords) {
      for (const [sellerId, count] of Object.entries(record.incrementalPricingSamplesBySellerId ?? {})) {
        incrementalPricingSamplesBySellerId[sellerId] = (incrementalPricingSamplesBySellerId[sellerId] ?? 0) + count;
      }
    }
    const hasAllPricingCounts = providerRecords.every((record) => Number.isInteger(record.pricingSampleCount) && Number.isInteger(record.referenceSampleCount));
    const totalPricingSamples = hasAllPricingCounts ? providerRecords.reduce((sum, record) => sum + (record.pricingSampleCount ?? 0), 0) : null;
    const totalReferenceSamples = hasAllPricingCounts ? providerRecords.reduce((sum, record) => sum + (record.referenceSampleCount ?? 0), 0) : null;
    const hasAllEstimates = providerRecords.every((record) => record.estimatedCostUSD !== null);
    const estimatedUSD = hasAllEstimates
      ? providerRecords.reduce((sum, record) => sum + record.estimatedCostUSD!, 0)
      : null;
    const hasAllActualCosts = providerRecords.every((record) => record.actualCostUSD !== null && record.costStatus === "ACTUAL");
    const actualUSD = hasAllActualCosts
      ? providerRecords.reduce((sum, record) => sum + record.actualCostUSD!, 0)
      : null;
    return {
      providerId,
      totalSearches,
      success: providerRecords.filter((record) => record.status === "SUCCESS").length,
      failure: providerRecords.filter((record) => record.status === "FAILED" || record.status === "BLOCKED" || record.status === "TIMEOUT").length,
      empty: providerRecords.filter((record) => record.status === "EMPTY").length,
      totalTimeMs,
      averageTimeMs: totalSearches ? Math.round(totalTimeMs / totalSearches) : 0,
      totalHttpRequests: providerRecords.reduce((sum, record) => sum + record.httpRequestCount, 0),
      totalApiCalls: providerRecords.reduce((sum, record) => sum + record.apiRequestCount, 0),
      totalCandidates: providerRecords.reduce((sum, record) => sum + record.candidateCount, 0),
      totalValidProducts,
      totalValidMatchingCandidates: providerRecords.reduce((sum, record) => sum + (record.validMatchingCandidateCount ?? 0), 0),
      totalUniqueSellers: providerRecords.reduce((sum, record) => sum + (record.uniqueSellerCount ?? 0), 0),
      totalIncrementalPricingSamples: Object.values(incrementalPricingSamplesBySellerId).reduce((sum, count) => sum + count, 0),
      incrementalPricingSamplesBySellerId,
      totalFailedRequests: providerRecords.reduce((sum, record) => sum + record.httpResponses.filter((response) => !response.success).length, 0),
      totalBlockedRequests: providerRecords.reduce((sum, record) => sum + record.httpResponses.filter((response) => [401, 403, 407, 429].includes(response.status ?? 0)).length, 0),
      totalPricingSamples,
      totalReferenceSamples,
      estimatedBrowserlessUnits: providerRecords.reduce((sum, record) => sum + (record.estimatedBrowserlessUnits ?? 0), 0),
      estimatedUSD,
      actualUSD,
      estimatedCostPerValidProductUSD: estimatedUSD !== null && totalValidProducts > 0 ? estimatedUSD / totalValidProducts : null,
      estimatedCostPerPricingSampleUSD: estimatedUSD !== null && totalPricingSamples !== null && totalPricingSamples > 0
        ? estimatedUSD / totalPricingSamples
        : null,
    };
  });
}

function isCostMetricRecord(value: unknown): value is CostMetricRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1
    && typeof record.researchRunId === "string"
    && (record.kind === "provider_metric" || record.kind === "browser_session_metric" || record.kind === "research_metric");
}
