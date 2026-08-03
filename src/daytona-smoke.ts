import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { processPriceResultWithDaytona } from "./daytona/price-processor.js";
import { disabledTavilyFallback } from "./price/tavily-price-fallback.js";
import { buildPriceResult } from "./price/matcher.js";
import { disabledStoreSnapshot } from "./price/store-verifier.js";
import type { SearchSnapshot } from "./price/types.js";
import type { ItemProfile } from "./profile/types.js";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function positiveInt(name: string, fallback: number, hardMax: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 必须是正整数。`);
  return Math.min(value, hardMax);
}

async function main(): Promise<void> {
  dotenv.config({ path: resolve(PROJECT_ROOT, ".env.local"), override: true, quiet: true });
  const sessionId = `smoke-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const fixtureRoot = resolve(PROJECT_ROOT, "fixtures", "price-reference");
  const profile = await readJson<ItemProfile>(resolve(fixtureRoot, "input.json"));
  const snapshot = await readJson<SearchSnapshot>(resolve(fixtureRoot, "search-snapshot.json"));
  const built = buildPriceResult({ profile, snapshot, tavilyFallback: disabledTavilyFallback(profile), storeSnapshot: disabledStoreSnapshot(), maxCardsScannedPerSource: 30, maxSamplesPerSource: 5 });
  const processed = await processPriceResultWithDaytona(built.result, {
    enabled: true,
    sessionId,
    apiKey: process.env.DAYTONA_API_KEY?.trim(),
    apiUrl: process.env.DAYTONA_API_URL?.trim(),
    target: process.env.DAYTONA_TARGET?.trim(),
    createTimeoutSeconds: positiveInt("DAYTONA_CREATE_TIMEOUT_SECONDS", 60, 120),
    executionTimeoutSeconds: positiveInt("DAYTONA_EXECUTION_TIMEOUT_SECONDS", 30, 60),
    stateTtlHours: positiveInt("DAYTONA_STATE_TTL_HOURS", 168, 168),
  });
  const directory = resolve(PROJECT_ROOT, "output", "daytona-smoke", sessionId);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "report.json"), `${JSON.stringify(processed.report, null, 2)}\n`, "utf8"),
    writeFile(resolve(directory, "state.json"), `${JSON.stringify(processed.state, null, 2)}\n`, "utf8"),
  ]);
  process.stdout.write(`${JSON.stringify({ sessionId, outputDirectory: directory, report: processed.report }, null, 2)}\n`);
  if (!processed.report.succeeded) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`Daytona smoke test 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
