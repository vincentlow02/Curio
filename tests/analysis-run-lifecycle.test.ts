import { describe, expect, it } from "vitest";
import { createAnalysisRunLifecycle } from "../src/features/analysis/lib/analysis-run-lifecycle";

describe("analysis run lifecycle", () => {
  it("aborts and invalidates a previous recognition when a new run starts", () => {
    const lifecycle = createAnalysisRunLifecycle();
    const first = lifecycle.beginRun();
    const second = lifecycle.beginRun();

    expect(first.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(first)).toBe(false);
    expect(lifecycle.isCurrent(second)).toBe(true);
  });

  it("rejects stale research attempts and duplicate active research", () => {
    const lifecycle = createAnalysisRunLifecycle();
    const firstRun = lifecycle.beginRun();
    lifecycle.finish(firstRun);
    const runId = lifecycle.currentRunId();
    expect(runId).not.toBeNull();

    const firstResearch = lifecycle.beginResearch(runId!);
    expect(firstResearch).not.toBeNull();
    expect(lifecycle.beginResearch(runId!)).toBeNull();

    lifecycle.invalidate();
    expect(firstResearch?.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(firstResearch!)).toBe(false);
  });

  it("does not let an old completion clear the current attempt", () => {
    const lifecycle = createAnalysisRunLifecycle();
    const run = lifecycle.beginRun();
    lifecycle.finish(run);
    const runId = lifecycle.currentRunId()!;
    const oldAttempt = lifecycle.beginResearch(runId)!;
    lifecycle.finish(oldAttempt);
    const currentAttempt = lifecycle.beginResearch(runId)!;

    lifecycle.finish(oldAttempt);

    expect(lifecycle.isCurrent(currentAttempt)).toBe(true);
  });

  it("invalidates and aborts active work when disposed", () => {
    const lifecycle = createAnalysisRunLifecycle();
    const execution = lifecycle.beginRun();

    lifecycle.dispose();

    expect(execution.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(execution)).toBe(false);
    expect(lifecycle.beginResearch(execution.runId)).toBeNull();
  });
});
