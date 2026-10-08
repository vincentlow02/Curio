"use client";

import { useCallback } from "react";
import type { ResearchStreamEvent } from "../../../core/analysis/types";
import { consumeResearchStream, type ResearchStreamConsumer } from "../services/research-stream";

export function useResearchStream(onEvent: (event: ResearchStreamEvent) => void): ResearchStreamConsumer {
  return useCallback(
    (stream, options) => consumeResearchStream(stream, options?.onEvent ?? onEvent, options?.signal),
    [onEvent],
  );
}
