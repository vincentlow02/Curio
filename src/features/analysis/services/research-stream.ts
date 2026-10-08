import { useCallback } from "react";
import type { ResearchStreamEvent } from "../../../core/analysis/types";

export type ResearchStreamConsumer = (stream: ReadableStream<Uint8Array>) => Promise<void>;

async function readResearchStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ResearchStreamEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      onEvent(JSON.parse(line) as ResearchStreamEvent);
    }
    if (chunk.done) break;
  }
}

export function useResearchStream(onEvent: (event: ResearchStreamEvent) => void): ResearchStreamConsumer {
  return useCallback((stream) => readResearchStream(stream, onEvent), [onEvent]);
}

export { readResearchStream as consumeResearchStream };
