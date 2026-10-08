"use client";

import { useCallback, useReducer, useRef } from "react";
import type { AnalysisSessionView, AnalysisStage, ResearchStreamEvent } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import type { DetectionResult, PokemonCardIdentity } from "../../../core/profile/types";
import { compressUpload } from "../lib/compress-upload";
import { uiCopy, type UiLocale } from "../locales";
import { saveRecentImage } from "../storage/recent-image-store";
import { recognizeCollectible, type RecognitionResponse } from "../services/recognition-service";
import { startResearch } from "../services/research-service";
import { useResearchStream } from "../services/research-stream";
import { analysisRunReducer, createInitialAnalysisRunState } from "../state/analysis-run-reducer";
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
  const {
    collectorMode,
    submittedText,
    session,
    historyView,
    recognitionDraft,
    creating,
    clarificationRequested,
    error,
    researchStarting,
  } = state;

  const sessionId = session?.id ?? (historyView?.result ? null : historyView?.id ?? null);
  const status: AnalysisStage | null = session?.status ?? historyView?.status ?? (historyView ? (historyView.result ? "completed" : historyView.recognition ? "identified" : "queued") : creating ? "queued" : null);
  const result = session?.result ?? historyView?.result ?? null;
  const activities = session?.toolActivity ?? historyView?.toolActivity ?? [];
  const isConversation = status !== null;
  const isResearch = status !== null && ["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"].includes(status);
  const isBusy = creating || researchStarting || (status !== null && ["queued", "identifying", "queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"].includes(status));

  const handleResearchEvent = useCallback((event: ResearchStreamEvent): void => {
    if (event.type === "stage") dispatch({ type: "research-stage", event, updatedAt: new Date().toISOString() });
    if (event.type === "completed") dispatch({ type: "research-completed", event, updatedAt: new Date().toISOString() });
    if (event.type === "error") throw new Error(event.error);
  }, []);
  const readResearchStream = useResearchStream(handleResearchEvent);

  const createAnalysis = useCallback(async (input: PendingInput): Promise<void> => {
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
        data.set("image", uploadFile);
      }
      const response = await recognizeCollectible(data);
      const body = response.body;
      if (response.status === 422 && body.code === "needs_clarification") {
        dispatch({ type: "clarification-requested" });
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Unable to create analysis.");
      const next = createAnalysisSession(body, input);
      if (uploadFile) await saveRecentImage(next.id, uploadFile).catch(() => undefined);
      dispatch({ type: "recognition-succeeded", session: next.session });
    } catch (caught) {
      dispatch({ type: "recognition-failed", error: caught instanceof Error ? caught.message : String(caught) });
    }
  }, [locale]);

  const submitInput = useCallback((input: PendingInput): void => {
    if (!input.file && !input.text.trim()) return;
    if (!input.file && !isSpecificDescription(input.text)) {
      dispatch({ type: "clarification-requested" });
      return;
    }
    void createAnalysis(input);
  }, [createAnalysis]);

  const continueResearch = useCallback(async (): Promise<void> => {
    if (!sessionId || !recognitionDraft || status !== "identified" || researchStarting) return;
    dispatch({ type: "research-started" });
    try {
      const response = await startResearch({
        sessionId,
        identification: recognitionDraft,
        collectorMode,
        collectorEvidence: session?.collectorEvidence ?? null,
        qwenActivity: activities.find((entry) => entry.provider === "Qwen") ?? null,
        locale,
      });
      onHistoryPromote?.(sessionId);
      dispatch({ type: "research-accepted", recognition: recognitionDraft });
      if (!response.body) throw new Error("The research stream was unavailable.");
      await readResearchStream(response.body);
      dispatch({ type: "research-finished" });
    } catch (caught) {
      dispatch({ type: "research-failed", error: caught instanceof Error ? caught.message : String(caught) });
    }
  }, [activities, collectorMode, locale, onHistoryPromote, readResearchStream, recognitionDraft, researchStarting, session?.collectorEvidence, sessionId, status]);

  const updateRecognition = useCallback(<Key extends keyof DetectionResult>(key: Key, value: DetectionResult[Key]): void => {
    dispatch({ type: "recognition-field-updated", key, value });
  }, []);

  const updatePokemonCard = useCallback(<Key extends keyof PokemonCardIdentity>(key: Key, value: PokemonCardIdentity[Key]): void => {
    dispatch({ type: "pokemon-card-field-updated", key, value });
  }, []);

  const resetAnalysis = useCallback((): void => {
    lastInput.current = null;
    dispatch({ type: "reset" });
  }, []);

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
    error,
    historyView,
    isBusy,
    isConversation,
    isResearch,
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
