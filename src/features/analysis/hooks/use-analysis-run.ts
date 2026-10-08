"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AnalysisSessionView } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import type { DetectionResult, PokemonCardIdentity } from "../../../core/profile/types";
import { compressUpload } from "../lib/compress-upload";
import type { UiLocale } from "../locales";
import { createAnalysisRunLifecycle } from "../lib/analysis-run-lifecycle";
import { deleteAnalysisImage, saveAnalysisImage } from "../services/history-service";
import { recognizeCollectible, type RecognitionResponse } from "../services/recognition-service";
import { startResearch } from "../services/research-service";
import { useResearchStream } from "./use-research-stream";
import { analysisRunReducer, createInitialAnalysisRunState, deriveAnalysisRunFlags, shouldShowInlineAnalysisError } from "../state/analysis-run-reducer";
import type { PendingInput, RecentAnalysisRecord } from "../types";

type UseAnalysisRunOptions = {
  locale: UiLocale;
  initialHistory: RecentAnalysisRecord | null;
  onHistoryPromote?: ((id: string) => void) | undefined;
};

export function createAnalysisSession(body: RecognitionResponse, input: PendingInput, now = new Date().toISOString()): { id: string; session: AnalysisSessionView } {
  const id = body.runId ?? body.sessionId;
  if (!id || !body.status) throw new Error(body.error ?? "Unable to create analysis.");
  return {
    id,
    session: {
      id,
      status: body.status,
      queuePosition: null,
      progress: body.status === "identified" ? 32 : 100,
      message: body.status === "identified" ? "Identification complete. Review the fields before continuing." : body.status === "needs_review" ? "More identification details are needed" : "Identification failed",
      identification: body.identification ?? null,
      collectorMode: body.collectorMode ?? input.collectorMode,
      collectorEvidence: body.collectorEvidence ?? null,
      toolActivity: body.toolActivity ?? [],
      createdAt: body.createdAt ?? now,
      updatedAt: body.createdAt ?? now,
      result: null,
      error: body.error ?? null,
    },
  };
}

export function useAnalysisRun({ locale, initialHistory, onHistoryPromote }: UseAnalysisRunOptions) {
  const [state, dispatch] = useReducer(analysisRunReducer, initialHistory, createInitialAnalysisRunState);
  const lastInput = useRef<PendingInput | null>(null);
  const lifecycleRef = useRef<ReturnType<typeof createAnalysisRunLifecycle> | null>(null);
  if (!lifecycleRef.current) lifecycleRef.current = createAnalysisRunLifecycle();
  const lifecycle = lifecycleRef.current;
  const runId = lifecycle.currentRunId();
  useEffect(() => {
    lifecycle.activate();
    return () => lifecycle.dispose();
  }, [lifecycle]);
  const {
    collectorMode,
    submittedText,
    session,
    historyView,
    recognitionDraft,
    error,
  } = state;

  const sessionId = session?.id ?? (historyView?.result ? null : historyView?.id ?? null);
  const { phase, status, isConversation, isResearch, isBusy } = deriveAnalysisRunFlags(state);
  const creating = phase === "recognizing";
  const clarificationRequested = phase === "clarification";
  const researchStarting = phase === "research-starting";
  const showInlineError = shouldShowInlineAnalysisError(state.error, phase, isConversation);
  const result = session?.result ?? historyView?.result ?? null;
  const activities = session?.toolActivity ?? historyView?.toolActivity ?? [];

  const readResearchStream = useResearchStream(() => undefined);

  const createAnalysis = useCallback(async (input: PendingInput): Promise<void> => {
    const execution = lifecycle.beginRun();
    lastInput.current = input;
    dispatch({ type: "analysis-started", submittedText: input.text });
    const data = new FormData();
    let uploadFile = input.file;
    if (input.text) data.set("text", input.text);
    if (input.category) data.set("category", input.category);
    data.set("collectorMode", String(input.collectorMode));
    data.set("locale", locale);
    try {
      if (uploadFile) {
        uploadFile = await compressUpload(uploadFile);
        if (!lifecycle.isCurrent(execution)) return;
        data.set("image", uploadFile);
      }
      const response = await recognizeCollectible(data, execution.controller.signal);
      if (!lifecycle.isCurrent(execution)) return;
      const body = response.body;
      if (response.status === 422 && body.code === "needs_clarification") {
        dispatch({ type: "clarification-requested" });
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Unable to create analysis.");
      const next = createAnalysisSession(body, input);
      if (uploadFile) {
        await saveAnalysisImage(next.id, uploadFile).catch(() => undefined);
        if (!lifecycle.isCurrent(execution)) {
          void deleteAnalysisImage(next.id).catch(() => undefined);
          return;
        }
      }
      if (!lifecycle.isCurrent(execution)) return;
      dispatch({ type: "recognition-succeeded", session: next.session });
    } catch (caught) {
      if (lifecycle.isCurrent(execution)) {
        dispatch({ type: "recognition-failed", error: caught instanceof Error ? caught.message : String(caught) });
      }
    } finally {
      lifecycle.finish(execution);
    }
  }, [lifecycle, locale]);

  const submitInput = useCallback((input: PendingInput): void => {
    if (!input.file && !input.text.trim()) return;
    if (!input.file && !isSpecificDescription(input.text)) {
      dispatch({ type: "clarification-requested" });
      return;
    }
    void createAnalysis(input);
  }, [createAnalysis]);

  const continueResearch = useCallback(async (): Promise<void> => {
    if (!runId || !sessionId || !recognitionDraft || phase !== "confirmation" || status !== "identified") return;
    const execution = lifecycle.beginResearch(runId);
    if (!execution) return;
    dispatch({ type: "research-started" });
    try {
      const response = await startResearch({
        sessionId,
        identification: recognitionDraft,
        collectorMode,
        collectorEvidence: session?.collectorEvidence ?? null,
        qwenActivity: activities.find((entry) => entry.provider === "Qwen") ?? null,
        locale,
      }, execution.controller.signal);
      if (!lifecycle.isCurrent(execution)) return;
      onHistoryPromote?.(sessionId);
      dispatch({ type: "research-accepted", recognition: recognitionDraft });
      if (!response.body) throw new Error("The research stream was unavailable.");
      let terminalEventReceived = false;
      await readResearchStream(response.body, {
        signal: execution.controller.signal,
        onEvent: (event) => {
          if (!lifecycle.isCurrent(execution)) return;
          if (event.type === "stage") dispatch({ type: "research-stage", event, updatedAt: new Date().toISOString() });
          if (event.type === "completed") {
            terminalEventReceived = true;
            dispatch({ type: "research-completed", event, updatedAt: new Date().toISOString() });
          }
          if (event.type === "error") throw new Error(event.error);
        },
      });
      if (!terminalEventReceived) throw new Error("The research stream ended before completion.");
    } catch (caught) {
      if (lifecycle.isCurrent(execution)) {
        dispatch({
          type: "research-failed",
          error: caught instanceof Error ? caught.message : String(caught),
          updatedAt: new Date().toISOString(),
        });
      }
    } finally {
      lifecycle.finish(execution);
    }
  }, [activities, collectorMode, lifecycle, locale, onHistoryPromote, phase, readResearchStream, recognitionDraft, runId, session?.collectorEvidence, sessionId, status]);

  const updateRecognition = useCallback(<Key extends keyof DetectionResult>(key: Key, value: DetectionResult[Key]): void => {
    dispatch({ type: "recognition-field-updated", key, value });
  }, []);

  const updatePokemonCard = useCallback(<Key extends keyof PokemonCardIdentity>(key: Key, value: PokemonCardIdentity[Key]): void => {
    dispatch({ type: "pokemon-card-field-updated", key, value });
  }, []);

  const resetAnalysis = useCallback((): void => {
    lifecycle.invalidate();
    lastInput.current = null;
    dispatch({ type: "reset" });
  }, [lifecycle]);

  const retryAnalysis = useCallback((): void => {
    if (lastInput.current) void createAnalysis(lastInput.current);
  }, [createAnalysis]);
  const setClarificationRequested = useCallback((value: boolean) => dispatch({ type: value ? "clarification-requested" : "clarification-cleared" }), []);
  const setCollectorMode = useCallback((value: boolean) => dispatch({ type: "collector-mode-changed", value }), []);
  const setError = useCallback((value: string | null) => dispatch({ type: "error-changed", value }), []);

  return {
    activities,
    clarificationRequested,
    collectorMode,
    creating,
    error: error?.message ?? null,
    historyView,
    isBusy,
    isConversation,
    isResearch,
    showInlineError,
    phase,
    recognitionDraft,
    researchStarting,
    result,
    session,
    sessionId,
    status,
    submittedText,
    resetAnalysis,
    retryAnalysis,
    setClarificationRequested,
    setCollectorMode,
    setError,
    submitInput,
    updatePokemonCard,
    updateRecognition,
    confirmRecognition: continueResearch,
  };
}
