import type { AnalysisSessionView, AnalysisStage, ResearchStreamEvent } from "../../../core/analysis/types";
import type { DetectionResult, PokemonCardIdentity } from "../../../core/profile/types";
import type { RecentAnalysisRecord } from "../types";
import { updatePokemonCardDraft, updateRecognitionDraft } from "../lib/analysis-run-state";

export type AnalysisRunState = {
  phase: AnalysisPhase;
  collectorMode: boolean;
  submittedText: string;
  session: AnalysisSessionView | null;
  historyView: RecentAnalysisRecord | null;
  recognitionDraft: DetectionResult | null;
  error: AnalysisRunError | null;
};

export type AnalysisPhase =
  | "input"
  | "clarification"
  | "recognizing"
  | "confirmation"
  | "research-starting"
  | "researching"
  | "completed"
  | "error";

export type AnalysisRunError = {
  kind: "input" | "workflow";
  message: string;
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
  | { type: "research-failed"; error: string; updatedAt: string }
  | { type: "reset" };

export type AnalysisRunFlags = {
  phase: AnalysisPhase;
  status: AnalysisStage | null;
  isConversation: boolean;
  isResearch: boolean;
  isBusy: boolean;
};

export function deriveAnalysisRunFlags(state: AnalysisRunState): AnalysisRunFlags {
  const status: AnalysisStage | null = state.session?.status
    ?? state.historyView?.status
    ?? (state.historyView ? (state.historyView.result ? "completed" : state.historyView.recognition ? "identified" : "queued") : null);
  const isConversation = ["recognizing", "confirmation", "research-starting", "researching", "completed"].includes(state.phase)
    || (state.phase === "error" && Boolean(state.session || state.historyView));
  return {
    phase: state.phase,
    status,
    isConversation,
    isResearch: state.phase === "researching" || state.phase === "completed",
    isBusy: ["recognizing", "research-starting", "researching"].includes(state.phase),
  };
}

export function shouldShowInlineAnalysisError(
  error: AnalysisRunError | null,
  phase: AnalysisPhase,
  isConversation: boolean,
): boolean {
  return error?.kind === "input" || (error?.kind === "workflow" && phase === "error" && !isConversation);
}

export function createInitialAnalysisRunState(historyView: RecentAnalysisRecord | null): AnalysisRunState {
  const historyStatus = historyView?.status ?? (historyView ? (historyView.result ? "completed" : historyView.recognition ? "identified" : "queued") : null);
  return {
    phase: historyPhase(historyStatus),
    collectorMode: historyView?.result?.collectorMode ?? historyView?.collectorMode ?? false,
    submittedText: historyView?.submittedText ?? "",
    session: null,
    historyView,
    recognitionDraft: historyView?.recognition ?? null,
    error: null,
  };
}

export function analysisRunReducer(state: AnalysisRunState, action: AnalysisRunAction): AnalysisRunState {
  switch (action.type) {
    case "analysis-started":
      return {
        ...state,
        phase: "recognizing",
        submittedText: action.submittedText,
        error: null,
        historyView: null,
        session: null,
        recognitionDraft: null,
      };
    case "clarification-requested":
      if (!["input", "clarification", "recognizing"].includes(state.phase) && !(state.phase === "error" && !state.session && !state.historyView)) return state;
      return { ...state, phase: "clarification", error: null };
    case "clarification-cleared":
      return state.phase === "clarification" ? { ...state, phase: "input" } : state;
    case "recognition-succeeded":
      if (state.phase !== "recognizing") return state;
      return {
        ...state,
        phase: action.session.status === "identified" ? "confirmation" : "error",
        error: action.session.status === "identified" || !action.session.error
          ? null
          : { kind: "workflow", message: action.session.error },
        session: action.session,
        recognitionDraft: action.session.identification,
      };
    case "recognition-failed":
      return state.phase === "recognizing"
        ? { ...state, phase: "error", error: { kind: "workflow", message: action.error } }
        : state;
    case "recognition-field-updated":
      if (state.phase !== "confirmation") return state;
      return {
        ...state,
        recognitionDraft: updateRecognitionDraft(state.recognitionDraft, action.key, action.value),
      };
    case "pokemon-card-field-updated":
      if (state.phase !== "confirmation") return state;
      return {
        ...state,
        recognitionDraft: updatePokemonCardDraft(state.recognitionDraft, action.key, action.value),
      };
    case "collector-mode-changed":
      return { ...state, collectorMode: action.value };
    case "error-changed":
      return {
        ...state,
        phase: state.phase === "error" && !state.session && !state.historyView && action.value === null ? "input" : state.phase,
        error: action.value ? { kind: "input", message: action.value } : null,
      };
    case "research-started":
      return state.phase === "confirmation" && state.session?.status === "identified"
        ? { ...state, phase: "research-starting", error: null }
        : state;
    case "research-accepted":
      if (state.phase !== "research-starting" || !state.session) return state;
      return {
        ...state,
        phase: "researching",
        session: {
          ...state.session,
          status: "queued_research",
          progress: 36,
          message: "Research started",
          queuePosition: null,
          identification: action.recognition,
        },
      };
    case "research-stage":
      if (state.phase !== "researching" || !state.session || !researchStages.has(action.event.status)) return state;
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
      if (state.phase !== "researching" || !state.session) return state;
      return {
        ...state,
        phase: "completed",
        error: null,
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
      if (state.phase !== "research-starting" && state.phase !== "researching") return state;
      return {
        ...state,
        phase: "error",
        error: { kind: "workflow", message: action.error },
        session: state.session ? {
          ...state.session,
          status: "failed",
          progress: 100,
          message: "Analysis failed",
          error: action.error,
          updatedAt: action.updatedAt,
        } : null,
      };
    case "reset":
      return createInitialAnalysisRunState(null);
    default:
      return state;
  }
}

function historyPhase(status: AnalysisStage | null): AnalysisPhase {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "needs_review") return "error";
  if (status === "identified") return "confirmation";
  if (status === "queued_research" || status === "searching_marketplaces" || status === "searching_auctions" || status === "searching_fallback" || status === "processing_prices") return "researching";
  if (status === "queued" || status === "identifying") return "recognizing";
  return "input";
}

const researchStages = new Set<AnalysisStage>([
  "queued_research",
  "searching_marketplaces",
  "searching_auctions",
  "searching_fallback",
  "processing_prices",
]);

const researchProgress: Partial<Record<AnalysisStage, number>> = {
  searching_marketplaces: 45,
  searching_auctions: 58,
  searching_fallback: 62,
  processing_prices: 80,
  completed: 100,
  failed: 100,
};
