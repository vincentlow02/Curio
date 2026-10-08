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
  it("initializes a new workflow and restores the selected history view", () => {
    expect(createInitialAnalysisRunState(null)).toMatchObject({
      collectorMode: false,
      submittedText: "",
      session: null,
      historyView: null,
      recognitionDraft: null,
      creating: false,
      clarificationRequested: false,
      error: null,
      researchStarting: false,
    });
    expect(createInitialAnalysisRunState(record())).toMatchObject({
      collectorMode: true,
      submittedText: "Vintage figure",
      historyView: record(),
      recognitionDraft: recognition,
    });
  });

  it("starts a fresh submission or retry and clears any prior run and error state", () => {
    const previous = {
      ...createInitialAnalysisRunState(record()),
      session: identifiedSession(),
      error: "Previous error",
    };

    expect(analysisRunReducer(previous, { type: "analysis-started", submittedText: "New item" })).toMatchObject({
      submittedText: "New item",
      creating: true,
      clarificationRequested: false,
      error: null,
      historyView: null,
      session: null,
    });
  });

  it("handles recognition success, clarification, and failure", () => {
    const success = analysisRunReducer(startingAnalysis(), { type: "recognition-succeeded", session: identifiedSession() });
    expect(success).toMatchObject({
      creating: false,
      session: identifiedSession(),
      recognitionDraft: recognition,
    });

    const needsClarification = analysisRunReducer(startingAnalysis(), { type: "clarification-requested" });
    expect(needsClarification).toMatchObject({ creating: false, clarificationRequested: true });
    expect(analysisRunReducer(needsClarification, { type: "clarification-cleared" }).clarificationRequested).toBe(false);

    const recognitionFailure = analysisRunReducer(startingAnalysis(), { type: "recognition-failed", error: "Recognition failed (503)" });
    expect(recognitionFailure).toMatchObject({
      creating: false,
      error: "Recognition failed (503)",
      submittedText: "Vintage figure",
      session: null,
    });
    expect(deriveAnalysisRunFlags(recognitionFailure)).toMatchObject({ status: null, isConversation: false });
    expect(shouldShowInlineAnalysisError(recognitionFailure.error, deriveAnalysisRunFlags(recognitionFailure).status)).toBe(true);

    const invalidImage = analysisRunReducer(recognitionFailure, { type: "error-changed", value: "Only JPG, PNG and WEBP images are supported." });
    expect(invalidImage.submittedText).toBe("Vintage figure");
    expect(shouldShowInlineAnalysisError(invalidImage.error, deriveAnalysisRunFlags(invalidImage).status)).toBe(true);
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
    const state = { ...createInitialAnalysisRunState(null), recognitionDraft: cardRecognition };

    expect(analysisRunReducer(state, {
      type: "recognition-field-updated",
      key: "category",
      value: "Toys & Character Collectibles",
    }).recognitionDraft).toEqual(recognition);
  });

  it("transitions from confirmation into research and updates progress atomically", () => {
    const identified = { ...createInitialAnalysisRunState(null), session: identifiedSession() };
    const accepted = analysisRunReducer(identified, { type: "research-accepted", recognition });
    expect(accepted).toMatchObject({
      researchStarting: true,
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
  });

  it("completes research, clears the pending flag, and enters an explicit failure state", () => {
    const searching = {
      ...createInitialAnalysisRunState(null),
      session: { ...fixtureSession("searching_marketplaces"), status: "searching_marketplaces" as const, identification: recognition },
      researchStarting: true,
    };
    const result = fixtureSession("success").result;
    if (!result) throw new Error("Expected fixture result");

    const completed = analysisRunReducer(searching, {
      type: "research-completed",
      event: { type: "completed", status: "completed", result, toolActivity: [] },
      updatedAt: "2026-10-08T00:02:00.000Z",
    });
    expect(analysisRunReducer(completed, { type: "research-finished" })).toMatchObject({
      researchStarting: false,
      session: { status: "completed", progress: 100, result },
    });

    const failed = analysisRunReducer(searching, {
      type: "research-failed",
      error: "Research request failed",
      updatedAt: "2026-10-08T00:03:00.000Z",
    });
    expect(failed).toMatchObject({
      researchStarting: false,
      error: "Research request failed",
      session: {
        status: "failed",
        progress: 100,
        identification: recognition,
        error: "Research request failed",
        updatedAt: "2026-10-08T00:03:00.000Z",
      },
    });
    expect(deriveAnalysisRunFlags(failed)).toMatchObject({
      status: "failed",
      isConversation: true,
      isResearch: false,
      isBusy: false,
    });
    expect(shouldShowInlineAnalysisError(failed.error, deriveAnalysisRunFlags(failed).status)).toBe(false);
  });

  it("resets all run state without changing the separate history persistence layer", () => {
    const active = {
      ...createInitialAnalysisRunState(record()),
      session: identifiedSession(),
      creating: true,
      clarificationRequested: true,
      error: "Run error",
      researchStarting: true,
    };

    expect(analysisRunReducer(active, { type: "reset" })).toEqual(createInitialAnalysisRunState(null));
  });
});
