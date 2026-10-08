import { afterEach, describe, expect, it, vi } from "vitest";
import { recognizeCollectible } from "../src/features/analysis/services/recognition-service";
import { startResearch } from "../src/features/analysis/services/research-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recognition service", () => {
  it("posts the supplied multipart input and returns the parsed clarification response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ code: "needs_clarification", error: "Add more detail." }, { status: 422 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const data = new FormData();
    data.set("text", "A collectible");
    data.set("collectorMode", "false");

    const result = await recognizeCollectible(data);

    expect(fetchMock).toHaveBeenCalledWith("/api/analysis", { method: "POST", body: data });
    expect(result).toEqual({
      ok: false,
      status: 422,
      body: { code: "needs_clarification", error: "Add more detail." },
    });
  });

  it("passes an optional abort signal through to fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "identified" }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await recognizeCollectible(new FormData(), controller.signal);

    expect(fetchMock).toHaveBeenCalledWith("/api/analysis", {
      method: "POST",
      body: expect.any(FormData),
      signal: controller.signal,
    });
  });
});

describe("research service", () => {
  it("posts the existing research request contract to the encoded run endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const identification = {
      itemName: "Figure",
      version: "Standard",
      category: "Toys & Character Collectibles",
    } as const;

    await startResearch({
      sessionId: "run/id",
      identification,
      collectorMode: true,
      collectorEvidence: null,
      qwenActivity: null,
      locale: "ja",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/analysis/run%2Fid/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identification,
        collectorMode: true,
        collectorEvidence: null,
        qwenActivity: null,
        locale: "ja",
      }),
    });
  });

  it("surfaces the API error message when the research request fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: "Research is unavailable." }, { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(startResearch({
      sessionId: "run-id",
      identification: {
        itemName: "Figure",
        version: "Standard",
        category: "Toys & Character Collectibles",
      },
      collectorMode: false,
      collectorEvidence: null,
      qwenActivity: null,
      locale: "en",
    })).rejects.toThrow("Research is unavailable.");
  });

  it("passes an optional abort signal through to fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await startResearch({
      sessionId: "run-id",
      identification: {
        itemName: "Figure",
        version: "Standard",
        category: "Toys & Character Collectibles",
      },
      collectorMode: false,
      collectorEvidence: null,
      qwenActivity: null,
      locale: "en",
    }, controller.signal);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });
});
