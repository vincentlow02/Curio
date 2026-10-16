import type { CollectorEvidence, ResearchStreamEvent } from "../../../../../core/analysis/types";
import { assertConfirmedIdentity } from "../../../../../core/profile/types";
import { researchCollectible } from "../../../../../server/analysis/run-pipeline";
import { RecognitionSnapshotError, resolveResearchKeyword, verifyRecognitionSnapshot } from "../../../../../server/analysis/keyword-resolution";
import { publicError } from "../../../../../server/security/redact-error";
import { checkDemoRateLimit } from "../../../../../server/security/demo-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

type RequestBody = {
  identification?: unknown;
  recognitionSnapshot?: unknown;
  collectorMode?: unknown;
  collectorEvidence?: CollectorEvidence | null;
  locale?: unknown;
};

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const rateLimit = checkDemoRateLimit(request);
  if (!rateLimit.allowed) return Response.json({ error: "The public demo usage limit has been reached. Please try again later." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } });
  const { sessionId: runId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return Response.json({ error: "Invalid analysis run ID." }, { status: 400 });
  let body: RequestBody;
  let snapshot: ReturnType<typeof verifyRecognitionSnapshot>;
  try {
    body = await request.json() as RequestBody;
    assertConfirmedIdentity(body.identification);
    snapshot = verifyRecognitionSnapshot(body.recognitionSnapshot, runId);
    if (typeof body.collectorMode !== "boolean") throw new Error("collectorMode must be a boolean.");
  } catch (error) {
    return Response.json({ error: error instanceof RecognitionSnapshotError ? error.message : publicError(error, "The research input is invalid.") }, { status: error instanceof RecognitionSnapshotError ? error.status : 400 });
  }

  const encoder = new TextEncoder();
  const workflowAbort = new AbortController();
  const abortFromRequest = (): void => workflowAbort.abort(request.signal.reason);
  if (request.signal.aborted) abortFromRequest();
  else request.signal.addEventListener("abort", abortFromRequest, { once: true });
  let streamCanceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ResearchStreamEvent): void => {
        if (workflowAbort.signal.aborted) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
        catch (error) { streamCanceled = true; workflowAbort.abort(error); }
      };
      void (async () => {
        try {
          send({ type: "stage", status: "queued_research", message: "Preparing the confirmed marketplace search", toolActivity: snapshot.qwenActivity ? [snapshot.qwenActivity] : [] });
          let resolved: Awaited<ReturnType<typeof resolveResearchKeyword>>;
          try { resolved = await resolveResearchKeyword({ snapshot, confirmed: body.identification }); }
          catch {
            send({ type: "error", status: "failed", error: "The search keyword could not be prepared. Retry with the confirmed identity; no new image upload is needed." });
            return;
          }
          if (workflowAbort.signal.aborted) return;
          const workflow = await researchCollectible({
            identification: resolved.identification,
            collectorMode: body.collectorMode as boolean,
            collectorEvidence: body.collectorEvidence ?? null,
            qwenActivity: resolved.qwenActivity,
            signal: workflowAbort.signal,
            onStage: (event) => send({ type: "stage", ...event }),
          });
          send({ type: "completed", status: "completed", ...workflow });
        } catch (error) {
          send({ type: "error", status: "failed", error: publicError(error, "The research providers were unavailable.") });
        } finally {
          request.signal.removeEventListener("abort", abortFromRequest);
          if (!streamCanceled) {
            try { controller.close(); } catch { /* The stream may have been canceled while research was settling. */ }
          }
        }
      })();
    },
    cancel(reason) {
      streamCanceled = true;
      if (!workflowAbort.signal.aborted) workflowAbort.abort(reason);
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
}
