import { afterEach, describe, expect, it, vi } from "vitest";

const originalFixture = process.env.WEB_USE_FIXTURE;
afterEach(() => {
  vi.unstubAllEnvs();
  if (originalFixture === undefined) delete process.env.WEB_USE_FIXTURE;
  else process.env.WEB_USE_FIXTURE = originalFixture;
  vi.resetModules();
});

describe("stateless Vercel API", () => {
  it("identifies synchronously and completes research through NDJSON", async () => {
    process.env.WEB_USE_FIXTURE = "true";
    vi.stubEnv("RECOGNITION_SNAPSHOT_SECRET", "test-recognition-snapshot-secret-with-high-entropy");
    vi.resetModules();
    const analysisRoute = await import("../src/app/api/analysis/route");
    const data = new FormData();
    data.set("text", "Nintendo Game Boy Advance AGS-001");
    data.set("collectorMode", "false");
    data.set("locale", "en");
    const identifyResponse = await analysisRoute.POST(new Request("http://localhost/api/analysis", { method: "POST", body: data }));
    const identified = await identifyResponse.json() as { runId: string; status: string; identification: { itemName: string; version: string; productType?: string; category: string }; recognitionSnapshot: string; collectorEvidence: unknown; toolActivity: unknown[] };
    expect(identifyResponse.status).toBe(200);
    expect(identified).toMatchObject({ status: "identified" });
    expect(identified.runId).toMatch(/^[0-9a-f-]{36}$/i);

    const researchRoute = await import("../src/app/api/analysis/[sessionId]/research/route");
    const researchResponse = await researchRoute.POST(new Request(`http://localhost/api/analysis/${identified.runId}/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identification: { itemName: identified.identification.itemName, version: identified.identification.version, productType: identified.identification.productType, category: identified.identification.category }, recognitionSnapshot: identified.recognitionSnapshot, collectorMode: false, collectorEvidence: identified.collectorEvidence }),
    }), { params: Promise.resolve({ sessionId: identified.runId }) });
    expect(researchResponse.status).toBe(200);
    expect(researchResponse.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await researchResponse.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string });
    expect(events.at(-1)?.type).toBe("completed");
  }, 20_000);
});
