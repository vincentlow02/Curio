import { useCallback } from "react";
import type { ResearchStreamEvent } from "../../../core/analysis/types";

export type ResearchStreamOptions = {
  signal?: AbortSignal;
  onEvent?: (event: ResearchStreamEvent) => void;
};

export type ResearchStreamConsumer = (stream: ReadableStream<Uint8Array>, options?: ResearchStreamOptions) => Promise<void>;

async function readResearchStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ResearchStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw createAbortError();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let cancelled = false;
  const cancelReader = (): void => {
    if (cancelled) return;
    cancelled = true;
    void reader.cancel().catch(() => undefined);
  };
  const onAbort = (): void => cancelReader();

  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw createAbortError();
      const chunk = await reader.read();
      if (signal?.aborted) throw createAbortError();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        if (signal?.aborted) throw createAbortError();
        onEvent(JSON.parse(line) as ResearchStreamEvent);
      }
      if (chunk.done) {
        completed = true;
        break;
      }
    }
  } catch (error) {
    if (!completed) cancelReader();
    if (signal?.aborted) throw createAbortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function useResearchStream(onEvent: (event: ResearchStreamEvent) => void): ResearchStreamConsumer {
  return useCallback((stream, options) => readResearchStream(stream, options?.onEvent ?? onEvent, options?.signal), [onEvent]);
}

export function consumeResearchStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ResearchStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return readResearchStream(stream, onEvent, signal);
}
