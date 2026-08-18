import "server-only";

import { env } from "../config/env";

export type ResearchDeadline = {
  remainingMs(): number;
  has(ms: number): boolean;
  signal: AbortSignal;
  close(): void;
};

export function createResearchDeadline(): ResearchDeadline {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("The research time budget was exhausted.")), env.researchTimeBudgetSeconds * 1000);
  timeout.unref?.();
  return {
    remainingMs: () => Math.max(0, env.researchTimeBudgetSeconds * 1000 - (Date.now() - startedAt)),
    has: (ms) => Date.now() - startedAt + ms < env.researchTimeBudgetSeconds * 1000,
    signal: controller.signal,
    close: () => clearTimeout(timeout),
  };
}
