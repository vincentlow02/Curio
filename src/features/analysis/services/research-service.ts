import type { CollectorEvidence, ToolActivity } from "../../../core/analysis/types";
import type { DetectionResult } from "../../../core/profile/types";
import type { UiLocale } from "../locales";

export type ResearchRequest = {
  sessionId: string;
  identification: DetectionResult;
  collectorMode: boolean;
  collectorEvidence: CollectorEvidence | null;
  qwenActivity: ToolActivity | null;
  locale: UiLocale;
};

export async function startResearch(request: ResearchRequest, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(`/api/analysis/${encodeURIComponent(request.sessionId)}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      identification: request.identification,
      collectorMode: request.collectorMode,
      collectorEvidence: request.collectorEvidence,
      qwenActivity: request.qwenActivity,
      locale: request.locale,
    }),
  });
  if (!response.ok) {
    const body = await response.json() as { error?: string };
    throw new Error(body.error ?? "Unable to start research.");
  }
  return response;
}
