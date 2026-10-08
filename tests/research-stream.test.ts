import { describe, expect, it, vi } from "vitest";
import type { ResearchStreamEvent } from "../src/core/analysis/types";
import {
  consumeResearchStream,
  ResearchStreamError,
  validateResearchStreamEvent,
} from "../src/features/analysis/services/research-stream";

function createStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function stageEvent(message: string): Extract<ResearchStreamEvent, { type: "stage" }> {
  return {
    type: "stage",
    status: "searching_marketplaces",
    message,
    toolActivity: [],
  };
}

function completedEvent(): Extract<ResearchStreamEvent, { type: "completed" }> {
  return {
    type: "completed",
    status: "completed",
    result: {
      identification: {
        itemName: "Vintage figure",
        version: "First release",
        priceSearchKeywordJa: "ヴィンテージ フィギュア",
        category: "Toys & Character Collectibles",
      },
      collectorMode: false,
      collectorEvidence: null,
      auctionSources: [
        { source: "Yahoo Auctions", status: "skipped", candidatesSeen: 0, comparableSignals: 0, signals: [] },
        { source: "Mandarake Auction", status: "skipped", candidatesSeen: 0, comparableSignals: 0, signals: [] },
      ],
      priceReference: {
        currency: "JPY",
        low: null,
        median: null,
        high: null,
        sampleCount: 0,
        samples: [],
        disclaimer: "Online asking-price reference",
      },
      recommendedAreas: [],
      storeSuggestions: [],
      warnings: [],
      cost: {
        qwenCalls: 1,
        inputTokens: 0,
        outputTokens: 0,
        marketplacePages: 2,
        auctionPages: 0,
        tavilyCalls: 0,
        daytonaCalls: 0,
        totalMs: 12,
      },
    },
    toolActivity: [],
  };
}

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<ResearchStreamEvent[]> {
  const events: ResearchStreamEvent[] = [];
  await consumeResearchStream(stream, (event) => events.push(event));
  return events;
}

async function expectStreamError(
  value: string,
  kind: ResearchStreamError["kind"],
): Promise<void> {
  await expect(collectEvents(createStream([encode(value)]))).rejects.toMatchObject({
    name: "ResearchStreamError",
    kind,
  });
}

describe("research stream", () => {
  it("parses a complete valid event in one chunk", async () => {
    const event = stageEvent("Searching");
    await expect(collectEvents(createStream([encode(`${JSON.stringify(event)}\n`)]))).resolves.toEqual([event]);
  });

  it("parses all event types currently emitted by the backend", async () => {
    const stage = stageEvent("Searching");
    const completed = completedEvent();
    const failed: ResearchStreamEvent = { type: "error", status: "failed", error: "Research failed." };

    await expect(collectEvents(createStream([
      encode([stage, completed, failed].map((event) => JSON.stringify(event)).join("\n")),
    ]))).resolves.toEqual([stage, completed, failed]);
  });

  it("accepts a completed event with zero comparable listings", async () => {
    const event = completedEvent();
    expect(event.result.priceReference.sampleCount).toBe(0);
    await expect(collectEvents(createStream([encode(JSON.stringify(event))]))).resolves.toEqual([event]);
  });

  it("accepts optional activity fields when omitted or supplied with valid values", async () => {
    const event = stageEvent("Searching");
    event.toolActivity = [
      { provider: "Qwen", status: "succeeded", calls: 1, durationMs: null },
      {
        provider: "Daytona",
        status: "skipped",
        calls: 0,
        durationMs: 0,
        verificationStatus: "not_run",
        fallbackUsed: false,
        cacheHit: false,
      },
    ];
    await expect(collectEvents(createStream([encode(JSON.stringify(event))]))).resolves.toEqual([event]);
  });

  it("parses an event split across multiple chunks", async () => {
    const event = stageEvent("Searching");
    const serialized = `${JSON.stringify(event)}\n`;
    const midpoint = Math.floor(serialized.length / 2);

    await expect(collectEvents(createStream([
      encode(serialized.slice(0, midpoint)),
      encode(serialized.slice(midpoint)),
    ]))).resolves.toEqual([event]);
  });

  it("parses multiple events in a single chunk in order", async () => {
    const events = [stageEvent("First"), stageEvent("Second")];

    await expect(collectEvents(createStream([encode(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`)]))).resolves.toEqual(events);
  });

  it("parses the final complete event without a terminating newline exactly once", async () => {
    const events = [stageEvent("First"), stageEvent("Final")];
    const handled: ResearchStreamEvent[] = [];

    await consumeResearchStream(
      createStream([encode(`${JSON.stringify(events[0])}\r\n${JSON.stringify(events[1])}  `)]),
      (event) => handled.push(event),
    );

    expect(handled).toEqual(events);
  });

  it("supports CRLF, blank lines, and trailing whitespace", async () => {
    const events = [stageEvent("First"), stageEvent("Second")];
    const body = ` \r\n${JSON.stringify(events[0])}  \r\n\t\r\n${JSON.stringify(events[1])} \r\n`;

    await expect(collectEvents(createStream([encode(body)]))).resolves.toEqual(events);
  });

  it("decodes multibyte UTF-8 characters split across chunks", async () => {
    const event = stageEvent("搜索中・調査中");
    const bytes = encode(`${JSON.stringify(event)}\n`);
    const splitAt = bytes.findIndex((byte, index) => index > 0 && (byte & 0xc0) === 0x80);

    await expect(collectEvents(createStream([bytes.slice(0, splitAt), bytes.slice(splitAt)]))).resolves.toEqual([event]);
  });

  it("ignores blank streams without crashing the parser", async () => {
    await expect(collectEvents(createStream([]))).resolves.toEqual([]);
  });

  it("rejects malformed JSON with a safe, categorized error", async () => {
    await expectStreamError("{sensitive response body}\n", "invalid-json");
  });

  it.each([null, [], 1, "event", {}])("rejects a non-event JSON shape: %j", async (value) => {
    await expectStreamError(`${JSON.stringify(value)}\n`, "invalid-event-shape");
  });

  it("rejects known events with missing required fields", async () => {
    const result = validateResearchStreamEvent({ type: "stage", status: "searching_marketplaces", toolActivity: [] });
    expect(result).toEqual({ kind: "invalid-required-field" });
    await expectStreamError('{"type":"stage","status":"searching_marketplaces","toolActivity":[]}\n', "invalid-required-field");
  });

  it("rejects invalid statuses", async () => {
    expect(validateResearchStreamEvent({
      type: "stage",
      status: "provider_running",
      message: "Searching",
      toolActivity: [],
    })).toEqual({ kind: "invalid-status" });
    await expectStreamError('{"type":"completed","status":"failed"}\n', "invalid-status");
  });

  it("rejects invalid nested fields in known event types", async () => {
    const malformed = {
      ...completedEvent(),
      result: { ...completedEvent().result, priceReference: { ...completedEvent().result.priceReference, sampleCount: "zero" } },
    };
    await expectStreamError(JSON.stringify(malformed), "invalid-required-field");
  });

  it("classifies and ignores unknown object event types for forward compatibility", async () => {
    const unknown = { type: "future.marketplace.progress", source: "BookOff" };
    expect(validateResearchStreamEvent(unknown)).toEqual({ kind: "unknown-event-type" });

    const known = stageEvent("Known event");
    await expect(collectEvents(createStream([
      encode(`${JSON.stringify(unknown)}\n${JSON.stringify(known)}\n`),
    ]))).resolves.toEqual([known]);
  });

  it("rejects an incomplete final JSON line instead of dispatching it", async () => {
    const incomplete = '{"type":"stage","status":"searching_marketplaces"';
    const handled: ResearchStreamEvent[] = [];

    await expect(consumeResearchStream(
      createStream([encode(incomplete)]),
      (event) => handled.push(event),
    )).rejects.toMatchObject({ kind: "invalid-json" });
    expect(handled).toEqual([]);
  });

  it("propagates callback failures and stops processing later events", async () => {
    const errorEvent: ResearchStreamEvent = { type: "error", status: "failed", error: "Research failed." };
    const trailing = stageEvent("Should not be handled");
    const handled: ResearchStreamEvent[] = [];

    await expect(consumeResearchStream(
      createStream([encode(`${JSON.stringify(errorEvent)}\n${JSON.stringify(trailing)}\n`)]),
      (event) => {
        handled.push(event);
        if (event.type === "error") throw new Error(event.error);
      },
    )).rejects.toThrow("Research failed.");
    expect(handled).toEqual([errorEvent]);
  });

  it("sanitizes reader errors and releases the reader lock", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("sensitive provider response"));
      },
    });

    await expect(collectEvents(stream)).rejects.toMatchObject({
      name: "ResearchStreamError",
      kind: "stream-read",
      message: "The research stream could not be read.",
    });
    expect(stream.locked).toBe(false);
  });

  it("cancels a pending reader on abort and dispatches no later events", async () => {
    let cancelCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCount += 1;
      },
    });
    const abortController = new AbortController();
    const handled: ResearchStreamEvent[] = [];
    const consuming = consumeResearchStream(stream, (event) => handled.push(event), abortController.signal);

    abortController.abort();

    await expect(consuming).rejects.toMatchObject({ name: "AbortError" });
    expect(handled).toEqual([]);
    expect(cancelCount).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it("handles a rejected reader cancellation without leaking its rejection", async () => {
    const abortController = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        return Promise.reject(new Error("cancellation failed"));
      },
    });
    const consuming = consumeResearchStream(stream, () => undefined, abortController.signal);

    abortController.abort();

    await expect(consuming).rejects.toMatchObject({ name: "AbortError" });
    expect(stream.locked).toBe(false);
  });

  it("does not dispatch an incomplete buffered event when aborted", async () => {
    let cancelCount = 0;
    const abortController = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('{"type":"stage","status":"searching_marketplaces"'));
      },
      cancel() {
        cancelCount += 1;
      },
    });
    const handled: ResearchStreamEvent[] = [];
    const consuming = consumeResearchStream(stream, (event) => handled.push(event), abortController.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    abortController.abort();

    await expect(consuming).rejects.toMatchObject({ name: "AbortError" });
    expect(handled).toEqual([]);
    expect(cancelCount).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it("does not acquire a reader when already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const stream = createStream([]);
    const getReader = stream.getReader.bind(stream);
    const getReaderSpy = vi.spyOn(stream, "getReader").mockImplementation(getReader);

    await expect(consumeResearchStream(stream, () => undefined, abortController.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getReaderSpy).not.toHaveBeenCalled();
  });
});
