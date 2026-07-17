import { Daytona, type Sandbox } from "@daytona/sdk";

import type { NumericRange, PriceReferenceResult, PriceSample } from "../price/types";

const PROCESSOR_VERSION = "daytona-price-mad-v1";
const OUTPUT_MARKER = "DAYTONA_PRICE_STATE=";

export type DaytonaPriceState = {
  version: 1;
  processorVersion: string;
  sessionId: string;
  processedAt: string;
  samples: Array<{
    source: PriceSample["source"];
    rank: number;
    url: string;
    includedInReferenceRange: boolean;
    aggregationExclusionReason: PriceSample["aggregationExclusionReason"];
  }>;
  referenceRange: NumericRange;
  referenceRangeBySource: PriceReferenceResult["referenceRangeBySource"];
  conditionRanges: PriceReferenceResult["conditionRanges"];
};

export type DaytonaRunReport = {
  enabled: boolean;
  attempted: boolean;
  succeeded: boolean;
  fallbackUsed: boolean;
  sandboxId: string | null;
  remoteStatePath: string | null;
  error: string | null;
  durationMs: number;
};

type DaytonaOptions = {
  enabled: boolean;
  sessionId: string;
  apiKey: string | undefined;
  apiUrl: string | undefined;
  target: string | undefined;
  createTimeoutSeconds: number;
  executionTimeoutSeconds: number;
  stateTtlHours: number;
};

function finiteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function assertRange(value: unknown, label: string): asserts value is NumericRange {
  const range = value as NumericRange;
  if (!range || !finiteInteger(range.sampleCount) || range.sampleCount < 0) throw new Error(`${label}.sampleCount 无效。`);
  for (const key of ["low", "median", "high"] as const) {
    if (range[key] !== null && !finiteInteger(range[key])) throw new Error(`${label}.${key} 无效。`);
  }
}

function assertState(value: unknown, expectedSessionId: string, result: PriceReferenceResult): asserts value is DaytonaPriceState {
  const state = value as DaytonaPriceState;
  if (!state || state.version !== 1 || state.processorVersion !== PROCESSOR_VERSION || state.sessionId !== expectedSessionId) {
    throw new Error("Daytona 返回了无效的 state 元数据。");
  }
  if (!Array.isArray(state.samples) || state.samples.length !== result.samples.length) throw new Error("Daytona 返回的样本数量不一致。");
  const expected = new Set(result.samples.map((sample) => `${sample.source}|${sample.rank}|${sample.url}`));
  for (const sample of state.samples) {
    if (!expected.has(`${sample.source}|${sample.rank}|${sample.url}`)) throw new Error("Daytona 返回了未知样本。");
    if (![null, "price_outlier", "new_condition", "unknown_condition"].includes(sample.aggregationExclusionReason)) throw new Error("Daytona 返回了无效的排除原因。");
  }
  assertRange(state.referenceRange, "referenceRange");
  if (!Array.isArray(state.referenceRangeBySource) || state.referenceRangeBySource.length !== result.referenceRangeBySource.length) throw new Error("Daytona 返回的来源区间无效。");
  state.referenceRangeBySource.forEach((entry, index) => assertRange(entry, `referenceRangeBySource[${index}]`));
  if (!Array.isArray(state.conditionRanges)) throw new Error("Daytona 返回的状态区间无效。");
  state.conditionRanges.forEach((entry, index) => assertRange(entry, `conditionRanges[${index}]`));
}

function buildSandboxCode(result: PriceReferenceResult, sessionId: string, statePath: string): string {
  const input = Buffer.from(JSON.stringify(result.samples), "utf8").toString("base64");
  return `
import { mkdir, writeFile } from "node:fs/promises";

(async () => {
const samples = JSON.parse(Buffer.from(${JSON.stringify(input)}, "base64").toString("utf8"));
const sources = ${JSON.stringify(result.referenceRangeBySource.map((entry) => entry.source))};
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};
const range = (items) => {
  const prices = items.map((item) => item.price);
  return { low: prices.length ? Math.min(...prices) : null, median: median(prices), high: prices.length ? Math.max(...prices) : null, sampleCount: prices.length };
};
const used = samples.filter((sample) => sample.condition === "used");
const usedMedian = median(used.map((sample) => sample.price));
const mad = usedMedian === null ? null : median(used.map((sample) => Math.abs(sample.price - usedMedian)));
const threshold = used.length >= 4 && mad !== null && mad > 0 ? 3 * 1.4826 * mad : Number.POSITIVE_INFINITY;
for (const sample of samples) {
  if (sample.condition === "new") sample.aggregationExclusionReason = "new_condition";
  else if (sample.condition === "unknown" && sample.source !== "Web fallback") sample.aggregationExclusionReason = "unknown_condition";
  else if (usedMedian !== null && Math.abs(sample.price - usedMedian) > threshold) sample.aggregationExclusionReason = "price_outlier";
  else sample.aggregationExclusionReason = null;
  sample.includedInReferenceRange = sample.aggregationExclusionReason === null;
}
const referenceSamples = samples.filter((sample) => sample.includedInReferenceRange);
const state = {
  version: 1,
  processorVersion: ${JSON.stringify(PROCESSOR_VERSION)},
  sessionId: ${JSON.stringify(sessionId)},
  processedAt: new Date().toISOString(),
  samples: samples.map(({ source, rank, url, includedInReferenceRange, aggregationExclusionReason }) => ({ source, rank, url, includedInReferenceRange, aggregationExclusionReason })),
  referenceRange: range(referenceSamples),
  referenceRangeBySource: sources.map((source) => ({ source, ...range(referenceSamples.filter((sample) => sample.source === source)) })),
  conditionRanges: ["used", "new", "unknown"].map((condition) => ({ condition, ...range(samples.filter((sample) => sample.condition === condition && (condition !== "used" || sample.includedInReferenceRange))) })).filter((entry) => entry.sampleCount > 0),
};
await mkdir(${JSON.stringify(statePath.slice(0, statePath.lastIndexOf("/")))}, { recursive: true });
await writeFile(${JSON.stringify(statePath)}, JSON.stringify(state, null, 2) + "\\n", "utf8");
console.log(${JSON.stringify(OUTPUT_MARKER)} + JSON.stringify(state));
})().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
`;
}

function applyState(result: PriceReferenceResult, state: DaytonaPriceState): void {
  const byKey = new Map(state.samples.map((sample) => [`${sample.source}|${sample.rank}|${sample.url}`, sample]));
  for (const sample of result.samples) {
    const processed = byKey.get(`${sample.source}|${sample.rank}|${sample.url}`)!;
    sample.includedInReferenceRange = processed.includedInReferenceRange;
    sample.aggregationExclusionReason = processed.aggregationExclusionReason;
  }
  result.referenceRange = { ...result.referenceRange, ...state.referenceRange };
  result.referenceRangeBySource = state.referenceRangeBySource;
  result.conditionRanges = state.conditionRanges;
}

export async function processPriceResultWithDaytona(result: PriceReferenceResult, options: DaytonaOptions): Promise<{ state: DaytonaPriceState | null; report: DaytonaRunReport }> {
  const started = Date.now();
  const report: DaytonaRunReport = {
    enabled: options.enabled,
    attempted: false,
    succeeded: false,
    fallbackUsed: false,
    sandboxId: null,
    remoteStatePath: null,
    error: null,
    durationMs: 0,
  };
  if (!options.enabled) return { state: null, report };
  report.attempted = true;
  if (!options.apiKey) {
    report.fallbackUsed = true;
    report.error = "DAYTONA_API_KEY 未配置。";
    report.durationMs = Date.now() - started;
    return { state: null, report };
  }
  const remoteStatePath = `/home/daytona/session/${options.sessionId}/state.json`;
  report.remoteStatePath = remoteStatePath;
  const config = {
    apiKey: options.apiKey,
    ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
    ...(options.target ? { target: options.target } : {}),
  };
  const daytona = new Daytona(config);
  let sandbox: Sandbox | null = null;
  try {
    sandbox = await daytona.create({
      language: "typescript",
      name: `collectible-${options.sessionId.slice(-17)}`,
      labels: { project: "qwen-spike", session: options.sessionId },
      networkBlockAll: true,
      autoStopInterval: 1,
      autoDeleteInterval: options.stateTtlHours * 60,
    }, { timeout: options.createTimeoutSeconds });
    report.sandboxId = sandbox.id;
    const response = await sandbox.process.codeRun(buildSandboxCode(result, options.sessionId, remoteStatePath), undefined, options.executionTimeoutSeconds);
    if (response.exitCode !== 0) throw new Error(`Daytona 代码退出码 ${response.exitCode}：${response.result}`);
    const markerIndex = response.result.lastIndexOf(OUTPUT_MARKER);
    if (markerIndex < 0) throw new Error("Daytona 输出中缺少结构化 state。");
    const line = response.result.slice(markerIndex + OUTPUT_MARKER.length).split(/\r?\n/, 1)[0];
    if (!line) throw new Error("Daytona 返回了空 state。");
    const state = JSON.parse(line) as unknown;
    assertState(state, options.sessionId, result);
    applyState(result, state);
    report.succeeded = true;
    report.durationMs = Date.now() - started;
    return { state, report };
  } catch (error) {
    report.fallbackUsed = true;
    report.error = error instanceof Error ? error.message : String(error);
    report.durationMs = Date.now() - started;
    return { state: null, report };
  } finally {
    if (sandbox) {
      try {
        if (report.succeeded) await sandbox.stop(30);
        else await sandbox.delete(30);
      }
      catch (error) { report.error ??= `Sandbox 停止失败：${error instanceof Error ? error.message : String(error)}`; }
    }
    await daytona[Symbol.asyncDispose]();
  }
}
