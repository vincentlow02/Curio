import type { CollectorEvidence, ToolActivity } from "../../../core/analysis/types";
import type { DetectionResult } from "../../../core/profile/types";

export type RecognitionResponse = {
  runId?: string;
  sessionId?: string;
  status?: "identified" | "needs_review" | "failed";
  identification?: DetectionResult | null;
  collectorEvidence?: CollectorEvidence | null;
  toolActivity?: ToolActivity[];
  createdAt?: string;
  error?: string;
  code?: string;
  collectorMode?: boolean;
};

export type RecognitionServiceResult = {
  ok: boolean;
  status: number;
  body: RecognitionResponse;
};

export async function recognizeCollectible(data: FormData, signal?: AbortSignal): Promise<RecognitionServiceResult> {
  const response = await fetch("/api/analysis", {
    method: "POST",
    body: data,
    ...(signal ? { signal } : {}),
  });
  const body = await response.json() as RecognitionResponse;
  return { ok: response.ok, status: response.status, body };
}
