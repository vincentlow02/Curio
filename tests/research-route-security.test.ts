import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/analysis/[sessionId]/research/route";
import { POST as recognize } from "../src/app/api/analysis/route";
import { researchCollectible } from "../src/server/analysis/run-pipeline";
import { resetDemoRateLimitForTests } from "../src/server/security/demo-rate-limit";
import { fixtureSession } from "../src/features/analysis/fixtures/analysis-view-models";
import { createRecognitionSnapshot } from "../src/server/analysis/keyword-resolution";
import { generatePriceSearchKeyword } from "../src/server/providers/qwen/detect";

vi.mock("../src/server/providers/qwen/detect", () => ({ generatePriceSearchKeyword: vi.fn() }));

vi.mock("../src/server/analysis/run-pipeline", () => ({
  researchCollectible: vi.fn(),
  identifyCollectible: vi.fn(),
}));

const runId = "00000000-0000-4000-8000-000000000000";
const context = { params: Promise.resolve({ sessionId: runId }) };

function researchRequest(client = "203.0.113.20"): Request {
  const original = {
    itemName: "Sony PSP-3000", version: "PSP-3000", category: "Toys & Character Collectibles" as const,
    priceSearchKeywordJa: "ソニー PSP-3000",
  };
  return new Request(`http://localhost/api/analysis/${runId}/research`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": client },
    body: JSON.stringify({
      identification: {
        itemName: original.itemName, version: original.version, category: original.category,
      },
      recognitionSnapshot: createRecognitionSnapshot(runId, original, null),
      collectorMode: false,
    }),
  });
}

beforeEach(() => {
  resetDemoRateLimitForTests();
  vi.clearAllMocks();
  vi.stubEnv("DEMO_RATE_LIMIT_MAX_REQUESTS", "5");
  vi.stubEnv("DEMO_GLOBAL_DAILY_LIMIT", "50");
  vi.stubEnv("DEMO_RATE_LIMIT_WINDOW_MINUTES", "60");
  vi.stubEnv("RECOGNITION_SNAPSHOT_SECRET", "test-recognition-snapshot-secret-with-high-entropy");
  const session = fixtureSession("success");
  vi.mocked(researchCollectible).mockResolvedValue({ result: session.result!, toolActivity: session.toolActivity });
  vi.mocked(generatePriceSearchKeyword).mockResolvedValue({ keyword: "PSP-2000 本体 中古", model: "keyword-model", inputTokens: 40, outputTokens: 8 });
});

afterEach(() => {
  resetDemoRateLimitForTests();
  vi.unstubAllEnvs();
});

describe("research route cost protection", () => {
  it("rejects a missing snapshot before any provider call", async () => {
    const response = await POST(new Request(`http://localhost/api/analysis/${runId}/research`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identification: { itemName: "Sony PSP-3000", version: "PSP-3000", category: "Toys & Character Collectibles" }, collectorMode: false }),
    }), context);
    expect(response.status).toBe(400);
    expect(vi.mocked(researchCollectible)).not.toHaveBeenCalled();
    expect(vi.mocked(generatePriceSearchKeyword)).not.toHaveBeenCalled();
  });

  it("rejects client-supplied search keywords even alongside a valid snapshot", async () => {
    const original = { itemName: "Sony PSP-3000", version: "PSP-3000", category: "Toys & Character Collectibles" as const, priceSearchKeywordJa: "PSP-3000 本体 中古" };
    const response = await POST(new Request(`http://localhost/api/analysis/${runId}/research`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identification: { ...original, priceSearchKeywordJa: "attacker keyword" }, recognitionSnapshot: createRecognitionSnapshot(runId, original, null), collectorMode: false }),
    }), context);
    expect(response.status).toBe(400);
    expect(researchCollectible).not.toHaveBeenCalled();
  });

  it("passes the server-regenerated keyword and actual two-call Qwen usage to research", async () => {
    const original = { itemName: "Sony PSP-3000", version: "PSP-3000", category: "Toys & Character Collectibles" as const, priceSearchKeywordJa: "PSP-3000 本体 中古" };
    const recognitionSnapshot = createRecognitionSnapshot(runId, original, { provider: "Qwen", status: "succeeded", calls: 1, durationMs: 100, inputTokens: 100, outputTokens: 20 });
    const response = await POST(new Request(`http://localhost/api/analysis/${runId}/research`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identification: { itemName: "Sony PSP-2000", version: "PSP-2000", category: original.category }, recognitionSnapshot, collectorMode: false }),
    }), context);
    expect(response.status).toBe(200);
    await response.text();
    expect(generatePriceSearchKeyword).toHaveBeenCalledOnce();
    expect(researchCollectible).toHaveBeenCalledWith(expect.objectContaining({
      identification: expect.objectContaining({ itemName: "Sony PSP-2000", priceSearchKeywordJa: "PSP-2000 本体 中古" }),
      qwenActivity: expect.objectContaining({ calls: 2, inputTokens: 140, outputTokens: 28 }),
    }));
  });

  it("does not research with an old keyword when regeneration fails, then retries the same confirmed identity", async () => {
    const original = { itemName: "Sony PSP-3000", version: "PSP-3000", category: "Toys & Character Collectibles" as const, priceSearchKeywordJa: "PSP-3000 本体 中古" };
    const recognitionSnapshot = createRecognitionSnapshot(runId, original, null);
    const makeRequest = () => new Request(`http://localhost/api/analysis/${runId}/research`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identification: { itemName: "Sony PSP-1000", version: "PSP-1000", category: original.category }, recognitionSnapshot, collectorMode: false }),
    });
    vi.mocked(generatePriceSearchKeyword)
      .mockRejectedValueOnce(new Error("provider failure"))
      .mockResolvedValueOnce({ keyword: "PSP-1000 本体 中古", model: "keyword-model", inputTokens: 40, outputTokens: 8 });

    const failed = await POST(makeRequest(), context);
    expect(failed.status).toBe(200);
    expect(await failed.text()).toContain('"type":"error"');
    expect(researchCollectible).not.toHaveBeenCalled();

    const retried = await POST(makeRequest(), context);
    expect(retried.status).toBe(200);
    expect(await retried.text()).toContain('"type":"completed"');
    expect(generatePriceSearchKeyword).toHaveBeenCalledTimes(2);
    expect(researchCollectible).toHaveBeenCalledWith(expect.objectContaining({
      identification: expect.objectContaining({ itemName: "Sony PSP-1000", priceSearchKeywordJa: "PSP-1000 本体 中古" }),
    }));
  });

  it("limits direct research calls even when recognition is bypassed", async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await POST(researchRequest(), context);
      expect(response.status).toBe(200);
      expect((await response.text()).trim()).toContain('"type":"completed"');
    }
    const blocked = await POST(researchRequest(), context);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect(researchCollectible).toHaveBeenCalledTimes(5);
  });

  it("does not let research bypass an exhausted recognition quota", async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await recognize(new Request("http://localhost/api/analysis", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.20" },
        body: new FormData(),
      }));
      expect(response.status).toBe(400);
    }
    const blocked = await POST(researchRequest(), context);
    expect(blocked.status).toBe(429);
    expect(researchCollectible).not.toHaveBeenCalled();
  });

  it("also limits calls distributed across client addresses within this process", async () => {
    vi.stubEnv("DEMO_GLOBAL_DAILY_LIMIT", "2");
    for (const client of ["203.0.113.21", "203.0.113.22"]) {
      const response = await POST(researchRequest(client), context);
      expect(response.status).toBe(200);
      await response.text();
    }
    expect((await POST(researchRequest("203.0.113.23"), context)).status).toBe(429);
    expect(researchCollectible).toHaveBeenCalledTimes(2);
  });

  it("aborts the research workflow when the NDJSON reader cancels", async () => {
    let workflowSignal: AbortSignal | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const session = fixtureSession("success");
    vi.mocked(researchCollectible).mockImplementation(async ({ signal }) => {
      workflowSignal = signal;
      markStarted();
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
      return { result: session.result!, toolActivity: session.toolActivity };
    });

    const response = await POST(researchRequest(), context);
    const reader = response.body!.getReader();
    await started;
    await reader.cancel("client disconnected");

    expect(workflowSignal?.aborted).toBe(true);
  });
});
