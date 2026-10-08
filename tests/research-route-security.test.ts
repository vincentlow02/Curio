import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/analysis/[sessionId]/research/route";
import { POST as recognize } from "../src/app/api/analysis/route";
import { researchCollectible } from "../src/server/analysis/run-pipeline";
import { resetDemoRateLimitForTests } from "../src/server/security/demo-rate-limit";
import { fixtureSession } from "../src/features/analysis/fixtures/analysis-view-models";

vi.mock("../src/server/analysis/run-pipeline", () => ({
  researchCollectible: vi.fn(),
  identifyCollectible: vi.fn(),
}));

const runId = "00000000-0000-4000-8000-000000000000";
const context = { params: Promise.resolve({ sessionId: runId }) };

function researchRequest(client = "203.0.113.20"): Request {
  return new Request(`http://localhost/api/analysis/${runId}/research`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": client },
    body: JSON.stringify({
      identification: {
        itemName: "Sony PSP-3000",
        version: "PSP-3000",
        category: "Toys & Character Collectibles",
        priceSearchKeywordJa: "ソニー PSP-3000",
      },
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
  const session = fixtureSession("success");
  vi.mocked(researchCollectible).mockResolvedValue({ result: session.result!, toolActivity: session.toolActivity });
});

afterEach(() => {
  resetDemoRateLimitForTests();
  vi.unstubAllEnvs();
});

describe("research route cost protection", () => {
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
});
