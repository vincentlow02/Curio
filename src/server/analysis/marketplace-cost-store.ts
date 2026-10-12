import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { CostMetricRecord } from "./marketplace-cost-tracker";

export const MARKETPLACE_COST_METRICS_DIRECTORY = "output/marketplace-cost";
export const MARKETPLACE_COST_METRICS_FILE = `${MARKETPLACE_COST_METRICS_DIRECTORY}/metrics.jsonl`;
export type CostMetricWriter = (jsonl: string) => Promise<void>;

export function yahooSellerContributionRatesFromJsonl(contents: string): Record<string, number> {
  const requests = new Map<string, number>();
  const samples = new Map<string, number>();
  for (const line of contents.split(/\r?\n/)) {
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      if (record.kind !== "provider_metric" || record.providerId !== "Yahoo! Shopping") continue;
      const requestCounts = record.sellerSearchRequestCountById;
      const sampleCounts = record.incrementalPricingSamplesBySellerId;
      if (!requestCounts || typeof requestCounts !== "object" || !sampleCounts || typeof sampleCounts !== "object") continue;
      for (const [sellerId, count] of Object.entries(requestCounts)) {
        if (typeof count === "number" && Number.isFinite(count) && count > 0) requests.set(sellerId, (requests.get(sellerId) ?? 0) + count);
      }
      for (const [sellerId, count] of Object.entries(sampleCounts)) {
        if (typeof count === "number" && Number.isFinite(count) && count > 0) samples.set(sellerId, (samples.get(sellerId) ?? 0) + count);
      }
    } catch {
      continue;
    }
  }
  return Object.fromEntries([...requests].map(([sellerId, requestCount]) => [sellerId, (samples.get(sellerId) ?? 0) / requestCount]));
}

export async function readYahooSellerContributionRates(): Promise<Record<string, number>> {
  try {
    const contents = await readFile(join(process.cwd(), "output", "marketplace-cost", "metrics.jsonl"), "utf8");
    return yahooSellerContributionRatesFromJsonl(contents);
  } catch {
    return {};
  }
}

let appendQueue: Promise<void> = Promise.resolve();

async function appendToLocalMetricsFile(jsonl: string): Promise<void> {
  const write = appendQueue.then(async () => {
    await mkdir(MARKETPLACE_COST_METRICS_DIRECTORY, { recursive: true });
    await appendFile(MARKETPLACE_COST_METRICS_FILE, jsonl, "utf8");
  });
  appendQueue = write.catch(() => undefined);
  await write;
}

export async function persistMarketplaceCostRecords(records: readonly CostMetricRecord[], write?: CostMetricWriter): Promise<void> {
  if (!records.length) return;
  if (process.env.NODE_ENV === "test" && !write) return;
  for (const record of records) {
    try { console.info(JSON.stringify({ event: "curio.marketplace.cost", ...record })); } catch { /* Logging must not fail the research result. */ }
  }
  try {
    await (write ?? appendToLocalMetricsFile)(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  } catch {
    console.warn(JSON.stringify({ event: "curio.marketplace.cost.persistence_unavailable", recordCount: records.length }));
  }
}
