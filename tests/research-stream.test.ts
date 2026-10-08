import { describe, expect, it } from "vitest";
import type { ResearchStreamEvent } from "../src/core/analysis/types";
import { consumeResearchStream } from "../src/features/analysis/services/research-stream";

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

function stageEvent(message: string): ResearchStreamEvent {
  return {
    type: "stage",
    status: "searching_marketplaces",
    message,
    toolActivity: [],
  };
}

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<ResearchStreamEvent[]> {
  const events: ResearchStreamEvent[] = [];
  await consumeResearchStream(stream, (event) => events.push(event));
  return events;
}

describe("research stream", () => {
  it("parses a complete event contained in one chunk", async () => {
    const event = stageEvent("Searching");
    await expect(collectEvents(createStream([encode(`${JSON.stringify(event)}\n`)]))).resolves.toEqual([event]);
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

  it("decodes multibyte UTF-8 characters split across chunks", async () => {
    const event = stageEvent("搜索中・調査中");
    const bytes = encode(`${JSON.stringify(event)}\n`);
    const splitAt = bytes.findIndex((byte, index) => index > 0 && (byte & 0xc0) === 0x80);

    await expect(collectEvents(createStream([bytes.slice(0, splitAt), bytes.slice(splitAt)]))).resolves.toEqual([event]);
  });

  it("ignores a final event without a terminating newline, matching the existing parser", async () => {
    const event = stageEvent("Final");

    await expect(collectEvents(createStream([encode(JSON.stringify(event))]))).resolves.toEqual([]);
  });

  it("ignores empty lines and preserves the order of valid events", async () => {
    const events = [stageEvent("First"), stageEvent("Second")];

    await expect(collectEvents(createStream([encode(`\n${JSON.stringify(events[0])}\n\n${JSON.stringify(events[1])}\n`)]))).resolves.toEqual(events);
  });

  it("rejects malformed JSON", async () => {
    await expect(collectEvents(createStream([encode("{invalid}\n")]))).rejects.toThrow(SyntaxError);
  });

  it("propagates stream read errors", async () => {
    let chunkSent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!chunkSent) {
          chunkSent = true;
          controller.enqueue(encode(`${JSON.stringify(stageEvent("Before error"))}\n`));
          return;
        }
        controller.error(new Error("Stream read failed."));
      },
    });
    const events: ResearchStreamEvent[] = [];

    await expect(consumeResearchStream(stream, (event) => events.push(event))).rejects.toThrow("Stream read failed.");
    expect(events).toEqual([stageEvent("Before error")]);
  });

  it("does not dispatch buffered incomplete data when the stream closes", async () => {
    const complete = stageEvent("Complete");
    const incomplete = stageEvent("Incomplete");
    const stream = createStream([encode(`${JSON.stringify(complete)}\n${JSON.stringify(incomplete)}`)]);

    await expect(collectEvents(stream)).resolves.toEqual([complete]);
  });

  it("stops processing events when an event handler rejects an error event", async () => {
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
});
