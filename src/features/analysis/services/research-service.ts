import type { CollectorEvidence } from "../../../core/analysis/types";
import type { ConfirmedIdentity } from "../../../core/profile/types";
import type { UiLocale } from "../locales";

export type ResearchRequest = {
  sessionId: string;
  recognitionSnapshot: string;
  identification: ConfirmedIdentity;
  collectorMode: boolean;
  collectorEvidence: CollectorEvidence | null;
  locale: UiLocale;
};

export async function startResearch(request: ResearchRequest, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(`/api/analysis/${encodeURIComponent(request.sessionId)}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      identification: request.identification,
      recognitionSnapshot: request.recognitionSnapshot,
      collectorMode: request.collectorMode,
      collectorEvidence: request.collectorEvidence,
      locale: request.locale,
    }),
  });
  if (!response.ok) {
    const body = await response.json() as { error?: string };
    throw new Error(body.error ?? "Unable to start research.");
  }
  return response;
}
