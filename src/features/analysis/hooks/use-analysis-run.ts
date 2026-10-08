"use client";

import { useCallback, useRef, useState } from "react";
import type { AnalysisResult, AnalysisSessionView, AnalysisStage, CollectorEvidence, ResearchStreamEvent, ToolActivity } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { buildPokemonCardSearchKeyword } from "../../../core/profile/pokemon-card";
import type { CollectibleCategory, DetectionResult, PokemonCardIdentity } from "../../../core/profile/types";
import { compressUpload } from "../lib/compress-upload";
import { uiCopy, type UiLocale } from "../locales";
import { saveRecentImage } from "../storage/recent-image-store";
import { recognizeCollectible, type RecognitionResponse } from "../services/recognition-service";
import { startResearch } from "../services/research-service";
import { useResearchStream } from "../services/research-stream";
import type { PendingInput, RecentAnalysisRecord } from "../types";

type UseAnalysisRunOptions = {
  locale: UiLocale;
  initialHistory: RecentAnalysisRecord | null;
  onHistoryPromote?: ((id: string) => void) | undefined;
};

const researchProgress: Partial<Record<AnalysisStage, number>> = {
  searching_marketplaces: 45,
  searching_auctions: 58,
  searching_fallback: 62,
  processing_prices: 80,
  completed: 100,
  failed: 100,
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

export function updateRecognitionDraft<Key extends keyof DetectionResult>(
  current: DetectionResult | null,
  key: Key,
  value: DetectionResult[Key],
): DetectionResult | null {
  if (!current) return current;
  const next = { ...current, [key]: value };
  if (key === "category" && value !== "Cards & Game Collectibles") delete next.pokemonCard;
  return next;
}

export function updatePokemonCardDraft<Key extends keyof PokemonCardIdentity>(
  current: DetectionResult | null,
  key: Key,
  value: PokemonCardIdentity[Key],
): DetectionResult | null {
  if (!current?.pokemonCard) return current;
  const pokemonCard = { ...current.pokemonCard, [key]: value };
  return { ...current, pokemonCard, priceSearchKeywordJa: buildPokemonCardSearchKeyword(pokemonCard) };
}

export function useAnalysisRun({ locale, initialHistory, onHistoryPromote }: UseAnalysisRunOptions) {
  const [collectorMode, setCollectorMode] = useState(initialHistory?.result?.collectorMode ?? initialHistory?.collectorMode ?? false);
  const [submittedText, setSubmittedText] = useState(initialHistory?.submittedText ?? "");
  const [sessionId, setSessionId] = useState<string | null>(initialHistory?.result ? null : initialHistory?.id ?? null);
  const [session, setSession] = useState<AnalysisSessionView | null>(null);
  const [historyView, setHistoryView] = useState(initialHistory);
  const [recognitionDraft, setRecognitionDraft] = useState<DetectionResult | null>(initialHistory?.recognition ?? null);
  const [creating, setCreating] = useState(false);
  const [clarificationRequested, setClarificationRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchStarting, setResearchStarting] = useState(false);
  const lastInput = useRef<PendingInput | null>(null);

  const status: AnalysisStage | null = session?.status ?? historyView?.status ?? (historyView ? (historyView.result ? "completed" : historyView.recognition ? "identified" : "queued") : creating ? "queued" : null);
  const result = session?.result ?? historyView?.result ?? null;
  const activities = session?.toolActivity ?? historyView?.toolActivity ?? [];
  const isConversation = status !== null;
  const isResearch = status !== null && ["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"].includes(status);
  const isBusy = creating || researchStarting || (status !== null && ["queued", "identifying", "queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"].includes(status));

  const handleResearchEvent = useCallback((event: ResearchStreamEvent): void => {
    if (event.type === "stage") setSession((current) => current ? { ...current, status: event.status, progress: researchProgress[event.status] ?? current.progress, message: event.message, toolActivity: event.toolActivity, updatedAt: new Date().toISOString() } : current);
    if (event.type === "completed") setSession((current) => current ? { ...current, status: "completed", progress: 100, message: "Analysis complete", result: event.result, toolActivity: event.toolActivity, updatedAt: new Date().toISOString(), error: null } : current);
    if (event.type === "error") throw new Error(event.error);
  }, []);
  const readResearchStream = useResearchStream(handleResearchEvent);

  const createAnalysis = useCallback(async (input: PendingInput): Promise<void> => {
    lastInput.current = input;
    setCreating(true);
    setError(null);
    setClarificationRequested(false);
    setHistoryView(null);
    setSession(null);
    setSessionId(null);
    setSubmittedText(input.text);
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
        setCreating(false);
        setClarificationRequested(true);
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Unable to create analysis.");
      const next = createAnalysisSession(body, input);
      if (uploadFile) await saveRecentImage(next.id, uploadFile).catch(() => undefined);
      setSessionId(next.id);
      setSession(next.session);
      setRecognitionDraft(next.session.identification);
      setCreating(false);
    } catch (caught) {
      setCreating(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [locale]);

  const submitInput = useCallback((input: PendingInput): void => {
    if (!input.file && !input.text.trim()) return;
    if (!input.file && !isSpecificDescription(input.text)) {
      setClarificationRequested(true);
      return;
    }
    void createAnalysis(input);
  }, [createAnalysis]);

  const continueResearch = useCallback(async (): Promise<void> => {
    if (!sessionId || !recognitionDraft || status !== "identified" || researchStarting) return;
    setResearchStarting(true);
    setError(null);
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
      setSession((current) => current ? { ...current, status: "queued_research", progress: 36, message: "Research started", queuePosition: null, identification: recognitionDraft } : current);
      if (!response.body) throw new Error("The research stream was unavailable.");
      await readResearchStream(response.body);
      setResearchStarting(false);
    } catch (caught) {
      setResearchStarting(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [activities, collectorMode, locale, onHistoryPromote, readResearchStream, recognitionDraft, researchStarting, session?.collectorEvidence, sessionId, status]);

  const updateRecognition = useCallback(<Key extends keyof DetectionResult>(key: Key, value: DetectionResult[Key]): void => {
    setRecognitionDraft((current) => updateRecognitionDraft(current, key, value));
  }, []);

  const updatePokemonCard = useCallback(<Key extends keyof PokemonCardIdentity>(key: Key, value: PokemonCardIdentity[Key]): void => {
    setRecognitionDraft((current) => updatePokemonCardDraft(current, key, value));
  }, []);

  const resetAnalysis = useCallback((): void => {
    lastInput.current = null;
    setHistoryView(null);
    setSession(null);
    setSessionId(null);
    setRecognitionDraft(null);
    setSubmittedText("");
    setCollectorMode(false);
    setError(null);
    setClarificationRequested(false);
    setCreating(false);
    setResearchStarting(false);
  }, []);

  const retryAnalysis = useCallback((): void => {
    if (lastInput.current) void createAnalysis(lastInput.current);
  }, [createAnalysis]);

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
