import { appendFile, mkdir } from "node:fs/promises";

import type { CostMetricRecord } from "./marketplace-cost-tracker";

export const MARKETPLACE_COST_METRICS_DIRECTORY = "output/marketplace-cost";
export const MARKETPLACE_COST_METRICS_FILE = `${MARKETPLACE_COST_METRICS_DIRECTORY}/metrics.jsonl`;
export type CostMetricWriter = (jsonl: string) => Promise<void>;

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
