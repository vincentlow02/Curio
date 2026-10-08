import type { AnalysisSessionView, AnalysisStage, ResearchStreamEvent } from "../../../core/analysis/types";
import type { DetectionResult, PokemonCardIdentity } from "../../../core/profile/types";
import type { RecentAnalysisRecord } from "../types";
import { updatePokemonCardDraft, updateRecognitionDraft } from "../lib/analysis-run-state";

export type AnalysisRunState = {
  collectorMode: boolean;
  submittedText: string;
  session: AnalysisSessionView | null;
  historyView: RecentAnalysisRecord | null;
  recognitionDraft: DetectionResult | null;
  creating: boolean;
  clarificationRequested: boolean;
  error: string | null;
  researchStarting: boolean;
};

export type AnalysisRunAction =
  | { type: "analysis-started"; submittedText: string }
  | { type: "clarification-requested" }
  | { type: "clarification-cleared" }
  | { type: "recognition-succeeded"; session: AnalysisSessionView }
  | { type: "recognition-failed"; error: string }
  | { type: "recognition-field-updated"; key: keyof DetectionResult; value: DetectionResult[keyof DetectionResult] }
  | { type: "pokemon-card-field-updated"; key: keyof PokemonCardIdentity; value: PokemonCardIdentity[keyof PokemonCardIdentity] }
  | { type: "collector-mode-changed"; value: boolean }
  | { type: "error-changed"; value: string | null }
  | { type: "research-started" }
  | { type: "research-accepted"; recognition: DetectionResult }
  | { type: "research-stage"; event: Extract<ResearchStreamEvent, { type: "stage" }>; updatedAt: string }
  | { type: "research-completed"; event: Extract<ResearchStreamEvent, { type: "completed" }>; updatedAt: string }
  | { type: "research-finished" }
  | { type: "research-failed"; error: string; updatedAt: string }
  | { type: "reset" };

export type AnalysisRunFlags = {
  status: AnalysisStage | null;
  isConversation: boolean;
  isResearch: boolean;
  isBusy: boolean;
};

export function deriveAnalysisRunFlags(state: AnalysisRunState): AnalysisRunFlags {
  const status: AnalysisStage | null = state.session?.status
    ?? state.historyView?.status
    ?? (state.historyView ? (state.historyView.result ? "completed" : state.historyView.recognition ? "identified" : "queued") : state.creating ? "queued" : null);
  return {
    status,
    isConversation: status !== null,
    isResearch: status !== null && ["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"].includes(status),
    isBusy: state.creating || state.researchStarting || (status !== null && ["queued", "identifying", "queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"].includes(status)),
  };
}

export function shouldShowInlineAnalysisError(error: string | null, status: AnalysisStage | null): boolean {
  return Boolean(error) && status !== "failed";
}

export function createInitialAnalysisRunState(historyView: RecentAnalysisRecord | null): AnalysisRunState {
  return {
    collectorMode: historyView?.result?.collectorMode ?? historyView?.collectorMode ?? false,
    submittedText: historyView?.submittedText ?? "",
    session: null,
    historyView,
    recognitionDraft: historyView?.recognition ?? null,
    creating: false,
    clarificationRequested: false,
    error: null,
    researchStarting: false,
  };
}

export function analysisRunReducer(state: AnalysisRunState, action: AnalysisRunAction): AnalysisRunState {
  switch (action.type) {
    case "analysis-started":
      return {
        ...state,
        submittedText: action.submittedText,
        creating: true,
        clarificationRequested: false,
        error: null,
        historyView: null,
        session: null,
      };
    case "clarification-requested":
      return { ...state, creating: false, clarificationRequested: true };
    case "clarification-cleared":
      return { ...state, clarificationRequested: false };
    case "recognition-succeeded":
      return {
        ...state,
        session: action.session,
        recognitionDraft: action.session.identification,
        creating: false,
      };
    case "recognition-failed":
      return { ...state, creating: false, error: action.error };
    case "recognition-field-updated":
      return {
        ...state,
        recognitionDraft: updateRecognitionDraft(state.recognitionDraft, action.key, action.value),
      };
    case "pokemon-card-field-updated":
      return {
        ...state,
        recognitionDraft: updatePokemonCardDraft(state.recognitionDraft, action.key, action.value),
      };
    case "collector-mode-changed":
      return { ...state, collectorMode: action.value };
    case "error-changed":
      return { ...state, error: action.value };
    case "research-started":
      return { ...state, researchStarting: true, error: null };
    case "research-accepted":
      return {
        ...state,
        researchStarting: true,
        session: state.session ? {
          ...state.session,
          status: "queued_research",
          progress: 36,
          message: "Research started",
          queuePosition: null,
          identification: action.recognition,
        } : null,
      };
    case "research-stage":
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          status: action.event.status,
          progress: researchProgress[action.event.status] ?? state.session.progress,
          message: action.event.message,
          toolActivity: action.event.toolActivity,
          updatedAt: action.updatedAt,
        },
      };
    case "research-completed":
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          status: "completed",
          progress: 100,
          message: "Analysis complete",
          result: action.event.result,
          toolActivity: action.event.toolActivity,
          updatedAt: action.updatedAt,
          error: null,
        },
      };
    case "research-failed":
      return {
        ...state,
        researchStarting: false,
        error: action.error,
        session: state.session ? {
          ...state.session,
          status: "failed",
          progress: 100,
          message: "Analysis failed",
          error: action.error,
          updatedAt: action.updatedAt,
        } : null,
      };
    case "research-finished":
      return { ...state, researchStarting: false };
    case "reset":
      return createInitialAnalysisRunState(null);
    default:
      return state;
  }
}

const researchProgress: Partial<Record<AnalysisStage, number>> = {
  searching_marketplaces: 45,
  searching_auctions: 58,
  searching_fallback: 62,
  processing_prices: 80,
  completed: 100,
  failed: 100,
};
