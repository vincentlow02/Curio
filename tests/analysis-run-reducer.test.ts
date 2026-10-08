import { describe, expect, it } from "vitest";
import type { AnalysisSessionView } from "../src/core/analysis/types";
import type { DetectionResult } from "../src/core/profile/types";
import { fixtureSession } from "../src/features/analysis/fixtures/analysis-view-models";
import {
  analysisRunReducer,
  createInitialAnalysisRunState,
  deriveAnalysisRunFlags,
  shouldShowInlineAnalysisError,
  type AnalysisRunState,
} from "../src/features/analysis/state/analysis-run-reducer";
import type { RecentAnalysisRecord } from "../src/features/analysis/types";

const recognition: DetectionResult = {
  itemName: "Vintage figure",
  version: "First release",
  priceSearchKeywordJa: "ヴィンテージ フィギュア",
  category: "Toys & Character Collectibles",
};

function identifiedSession(): AnalysisSessionView {
  return { ...fixtureSession("identifying"), status: "identified", identification: recognition };
}

function record(overrides: Partial<RecentAnalysisRecord> = {}): RecentAnalysisRecord {
  return {
    id: "history-id",
    title: "Vintage figure",
    submittedText: "Vintage figure",
    recognition,
    result: null,
    toolActivity: [],
    status: "identified",
    collectorMode: true,
    createdAt: "2026-10-08T00:00:00.000Z",
    ...overrides,
  };
}

function startingAnalysis(state: AnalysisRunState = createInitialAnalysisRunState(null)): AnalysisRunState {
  return analysisRunReducer(state, { type: "analysis-started", submittedText: "Vintage figure" });
}

describe("analysis run reducer", () => {
  it("continues a restored identified history through completion", () => {
    const restored = createInitialAnalysisRunState(record());
    expect(restored.session).toMatchObject({ id: "history-id", status: "identified", identification: recognition });
    const starting = analysisRunReducer(restored, { type: "research-started" });
    expect(starting.phase).toBe("research-starting");
    const researching = analysisRunReducer(starting, { type: "research-accepted", recognition });
    const result = fixtureSession("success").result!;
    const completed = analysisRunReducer(researching, {
      type: "research-completed",
      event: { type: "completed", status: "completed", result, toolActivity: [] },
      updatedAt: "2026-10-08T00:02:00.000Z",
    });
    expect(completed.session?.result).toEqual(result);
    expect(deriveAnalysisRunFlags(completed)).toMatchObject({ phase: "completed", isBusy: false });
  });

  it.each(["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"] as const)(
    "restores interrupted %s as confirmation, not a live busy request", (status) => {
      const restored = createInitialAnalysisRunState(record({ status }));
      expect(deriveAnalysisRunFlags(restored)).toMatchObject({ phase: "confirmation", status: "identified", isBusy: false });
      expect(analysisRunReducer(restored, { type: "research-started" }).phase).toBe("research-starting");
    },
  );

  it.each(["queued", "identifying", "searching_marketplaces"] as const)(
    "restores %s without recognition as a recoverable error, not endless loading", (status) => {
      const restored = createInitialAnalysisRunState(record({ status, recognition: null }));
      expect(deriveAnalysisRunFlags(restored)).toMatchObject({ phase: "error", status: "failed", isBusy: false });
      expect(restored.error?.message).toContain("interrupted");
      expect(analysisRunReducer(restored, { type: "reset" }).phase).toBe("input");
    },
  );

  it("preserves completed and legacy history without creating an active session", () => {
    const result = fixtureSession("success").result!;
    const restored = createInitialAnalysisRunState(record({ status: "searching_marketplaces", result }));
    expect(restored.session).toBeNull();
    expect(restored.historyView?.result).toEqual(result);
    expect(deriveAnalysisRunFlags(restored)).toMatchObject({ status: "completed", isBusy: false });
    expect(restored.phase).toBe("completed");
    const legacy = record();
    delete legacy.status;
    expect(createInitialAnalysisRunState(legacy).session?.status).toBe("identified");
  });

  it("initializes a new workflow and restores the selected history view", () => {
    expect(createInitialAnalysisRunState(null)).toMatchObject({
      phase: "input",
      collectorMode: false,
      submittedText: "",
      session: null,
      historyView: null,
      recognitionDraft: null,
      error: null,
    });
    expect(createInitialAnalysisRunState(record())).toMatchObject({
      phase: "confirmation",
      collectorMode: true,
      submittedText: "Vintage figure",
      historyView: record(),
      recognitionDraft: recognition,
    });
    expect(createInitialAnalysisRunState(record({
      status: "completed",
      result: fixtureSession("success").result,
    })).phase).toBe("completed");
  });

  it("starts a fresh submission or retry and clears any prior run and error state", () => {
    const previous = {
      ...createInitialAnalysisRunState(record()),
      session: identifiedSession(),
      error: { kind: "workflow" as const, message: "Previous error" },
    };

    expect(analysisRunReducer(previous, { type: "analysis-started", submittedText: "New item" })).toMatchObject({
      phase: "recognizing",
      submittedText: "New item",
      error: null,
      historyView: null,
      session: null,
      recognitionDraft: null,
    });
  });

  it("handles recognition success, clarification, and failure", () => {
    const success = analysisRunReducer(startingAnalysis(), { type: "recognition-succeeded", session: identifiedSession() });
    expect(success).toMatchObject({
      phase: "confirmation",
      session: identifiedSession(),
      recognitionDraft: recognition,
    });

    const needsClarification = analysisRunReducer(startingAnalysis(), { type: "clarification-requested" });
    expect(needsClarification.phase).toBe("clarification");
    expect(needsClarification.submittedText).toBe("Vintage figure");
    expect(analysisRunReducer(needsClarification, { type: "clarification-cleared" }).phase).toBe("input");

    const recognitionFailure = analysisRunReducer(startingAnalysis(), { type: "recognition-failed", error: "Recognition failed (503)" });
    expect(recognitionFailure).toMatchObject({
      phase: "error",
      error: { kind: "workflow", message: "Recognition failed (503)" },
      submittedText: "Vintage figure",
      session: null,
    });
    expect(deriveAnalysisRunFlags(recognitionFailure)).toMatchObject({ phase: "error", status: null, isConversation: false, isBusy: false });
    expect(shouldShowInlineAnalysisError(recognitionFailure.error, recognitionFailure.phase, false)).toBe(true);

    const invalidImage = analysisRunReducer(recognitionFailure, { type: "error-changed", value: "Only JPG, PNG and WEBP images are supported." });
    expect(invalidImage.submittedText).toBe("Vintage figure");
    expect(shouldShowInlineAnalysisError(invalidImage.error, invalidImage.phase, false)).toBe(true);
  });

  it("updates confirmation fields and removes card identity when the category changes", () => {
    const cardRecognition: DetectionResult = {
      ...recognition,
      category: "Cards & Game Collectibles",
      pokemonCard: {
        cardName: "Card",
        cardNumber: "001",
        setCode: "SET",
        setName: "Set",
        rarity: "Rare",
        language: "Japanese",
        edition: "1st",
        gradingCompany: "ungraded",
        grade: "N/A",
      },
    };
    const state = { ...createInitialAnalysisRunState(null), phase: "confirmation" as const, recognitionDraft: cardRecognition };

    expect(analysisRunReducer(state, {
      type: "recognition-field-updated",
      key: "category",
      value: "Toys & Character Collectibles",
    }).recognitionDraft).toEqual(recognition);
  });

  it("transitions from confirmation into research and updates progress atomically", () => {
    const identified = { ...createInitialAnalysisRunState(null), phase: "confirmation" as const, session: identifiedSession() };
    const startingResearch = analysisRunReducer(identified, { type: "research-started" });
    const accepted = analysisRunReducer(startingResearch, { type: "research-accepted", recognition });
    expect(accepted).toMatchObject({
      phase: "researching",
      session: { status: "queued_research", progress: 36, identification: recognition },
    });

    const progressed = analysisRunReducer(accepted, {
      type: "research-stage",
      event: {
        type: "stage",
        status: "searching_marketplaces",
        message: "Searching marketplaces",
        toolActivity: [],
      },
      updatedAt: "2026-10-08T00:01:00.000Z",
    });
    expect(progressed.session).toMatchObject({
      status: "searching_marketplaces",
      progress: 45,
      message: "Searching marketplaces",
      updatedAt: "2026-10-08T00:01:00.000Z",
    });
    const invalidCompletion = analysisRunReducer(accepted, {
      type: "research-stage",
      event: { type: "stage", status: "completed", message: "Invalid stage completion", toolActivity: [] },
      updatedAt: "2026-10-08T00:01:30.000Z",
    });
    expect(invalidCompletion).toBe(accepted);
  });

  it("completes research and enters an explicit failure state", () => {
    const confirmation = {
      ...createInitialAnalysisRunState(null),
      phase: "confirmation" as const,
      session: identifiedSession(),
    };
    const searching = analysisRunReducer(confirmation, { type: "research-started" });
    const researching = analysisRunReducer(searching, { type: "research-accepted", recognition });
    const result = fixtureSession("success").result;
    if (!result) throw new Error("Expected fixture result");

    const completed = analysisRunReducer(researching, {
      type: "research-completed",
      event: { type: "completed", status: "completed", result, toolActivity: [] },
      updatedAt: "2026-10-08T00:02:00.000Z",
    });
    expect(completed).toMatchObject({
      phase: "completed",
      session: { status: "completed", progress: 100, result },
    });
    expect(deriveAnalysisRunFlags(completed).isBusy).toBe(false);

    const failed = analysisRunReducer(researching, {
      type: "research-failed",
      error: "Research request failed",
      updatedAt: "2026-10-08T00:03:00.000Z",
    });
    expect(failed).toMatchObject({
      phase: "error",
      error: { kind: "workflow", message: "Research request failed" },
      session: {
        status: "failed",
        progress: 100,
        identification: recognition,
        error: "Research request failed",
        updatedAt: "2026-10-08T00:03:00.000Z",
      },
    });
    expect(deriveAnalysisRunFlags(failed)).toMatchObject({
      phase: "error",
      status: "failed",
      isConversation: true,
      isResearch: false,
      isBusy: false,
    });
    expect(shouldShowInlineAnalysisError(failed.error, failed.phase, true)).toBe(false);
    expect(analysisRunReducer(completed, {
      type: "research-failed",
      error: "Late error",
      updatedAt: "2026-10-08T00:03:30.000Z",
    })).toBe(completed);
  });

  it("resets all run state without changing the separate history persistence layer", () => {
    const active = {
      ...createInitialAnalysisRunState(record()),
      session: identifiedSession(),
      phase: "researching",
      error: { kind: "workflow", message: "Run error" },
    };

    expect(analysisRunReducer(active, { type: "reset" })).toEqual(createInitialAnalysisRunState(null));
  });

  it("ignores invalid transitions and stale actions after a new run starts", () => {
    const initial = createInitialAnalysisRunState(null);
    expect(analysisRunReducer(initial, { type: "research-started" })).toBe(initial);

    const oldRun = startingAnalysis();
    const currentRun = analysisRunReducer(oldRun, { type: "recognition-failed", error: "Current run failed" });
    const staleRecognition = analysisRunReducer(currentRun, { type: "recognition-succeeded", session: identifiedSession() });
    expect(staleRecognition).toBe(currentRun);

    const confirmation = analysisRunReducer(oldRun, { type: "recognition-succeeded", session: identifiedSession() });
    const researching = analysisRunReducer(
      analysisRunReducer(confirmation, { type: "research-started" }),
      { type: "research-accepted", recognition },
    );
    const staleCompleted = analysisRunReducer(researching, { type: "research-completed", event: {
      type: "completed",
      status: "completed",
      result: fixtureSession("success").result!,
      toolActivity: [],
    }, updatedAt: "2026-10-08T00:04:00.000Z" });
    expect(staleCompleted.phase).toBe("completed");
    expect(analysisRunReducer(staleCompleted, { type: "research-stage", event: {
      type: "stage",
      status: "searching_marketplaces",
      message: "Late progress",
      toolActivity: [],
    }, updatedAt: "2026-10-08T00:05:00.000Z" })).toBe(staleCompleted);

    const reset = analysisRunReducer(staleCompleted, { type: "reset" });
    expect(reset.phase).toBe("input");
    expect(deriveAnalysisRunFlags(reset).isBusy).toBe(false);
  });

  it("keeps research progress in one phase and does not treat stage events as completion", () => {
    const confirmed = analysisRunReducer(startingAnalysis(), { type: "recognition-succeeded", session: identifiedSession() });
    const starting = analysisRunReducer(confirmed, { type: "research-started" });
    expect(starting.phase).toBe("research-starting");
    expect(deriveAnalysisRunFlags(starting).isBusy).toBe(true);

    const researching = analysisRunReducer(starting, { type: "research-accepted", recognition });
    const progressed = analysisRunReducer(researching, {
      type: "research-stage",
      event: { type: "stage", status: "processing_prices", message: "Pricing", toolActivity: [] },
      updatedAt: "2026-10-08T00:06:00.000Z",
    });
    expect(progressed.phase).toBe("researching");
    expect(deriveAnalysisRunFlags(progressed).isBusy).toBe(true);
  });
});
