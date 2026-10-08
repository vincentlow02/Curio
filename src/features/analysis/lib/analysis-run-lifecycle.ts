export type AnalysisExecution = {
  runId: number;
  attempt: number;
  kind: "recognition" | "research";
  controller: AbortController;
};

export type AnalysisRunLifecycle = {
  activate: () => void;
  currentRunId: () => number | null;
  beginRun: () => AnalysisExecution;
  restoreRun: () => number | null;
  beginResearch: (runId: number) => AnalysisExecution | null;
  isCurrent: (execution: AnalysisExecution) => boolean;
  finish: (execution: AnalysisExecution) => void;
  invalidate: () => void;
  dispose: () => void;
};

export function createAnalysisRunLifecycle(): AnalysisRunLifecycle {
  let generation = 0;
  let currentRun: number | null = null;
  let researchAttempt = 0;
  let mounted = true;
  let recognition: AnalysisExecution | null = null;
  let research: AnalysisExecution | null = null;

  function abort(execution: AnalysisExecution | null): void {
    if (execution && !execution.controller.signal.aborted) execution.controller.abort();
  }

  function invalidate(): void {
    generation += 1;
    currentRun = null;
    const oldRecognition = recognition;
    const oldResearch = research;
    recognition = null;
    research = null;
    abort(oldRecognition);
    abort(oldResearch);
  }

  return {
    activate() {
      mounted = true;
    },
    currentRunId() {
      return currentRun;
    },
    beginRun() {
      invalidate();
      currentRun = generation;
      const execution: AnalysisExecution = {
        runId: generation,
        attempt: 0,
        kind: "recognition",
        controller: new AbortController(),
      };
      recognition = execution;
      return execution;
    },
    beginResearch(runId) {
      if (!mounted || runId !== currentRun) return null;
      if (research && !research.controller.signal.aborted) return null;
      const execution: AnalysisExecution = {
        runId,
        attempt: ++researchAttempt,
        kind: "research",
        controller: new AbortController(),
      };
      research = execution;
      return execution;
    },
    restoreRun() {
      if (!mounted) return null;
      if (currentRun === null) {
        invalidate();
        currentRun = generation;
      }
      return currentRun;
    },
    isCurrent(execution) {
      return mounted
        && execution.runId === currentRun
        && !execution.controller.signal.aborted
        && (execution.kind === "recognition" ? recognition === execution : research === execution);
    },
    finish(execution) {
      if (execution.kind === "recognition" && recognition === execution) recognition = null;
      if (execution.kind === "research" && research === execution) research = null;
    },
    invalidate,
    dispose() {
      mounted = false;
      invalidate();
    },
  };
}
