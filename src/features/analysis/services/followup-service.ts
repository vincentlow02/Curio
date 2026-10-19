import type { AnalysisResult } from "../../../core/analysis/types";
import type { UiLocale } from "../locales";
import type { AnalysisFollowup } from "../types";

export async function answerFollowup(question: string, result: AnalysisResult, locale: UiLocale, history: AnalysisFollowup[]): Promise<string> {
  const response = await fetch("/api/followup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: history.slice(-10).map(({ question: priorQuestion, answer }) => ({ question: priorQuestion, answer })), result, locale }),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "The follow-up could not be answered.";
    throw new Error(message);
  }
  if (!body || typeof body !== "object" || !("answer" in body) || typeof body.answer !== "string" || !body.answer.trim()) {
    throw new Error("The follow-up response was invalid.");
  }
  return body.answer.trim();
}
