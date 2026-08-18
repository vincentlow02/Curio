import type { CollectorEvidence, ResearchStreamEvent, ToolActivity } from "../../../../../core/analysis/types";
import { buildPokemonCardSearchKeyword } from "../../../../../core/profile/pokemon-card";
import { assertDetectionResult, type DetectionResult } from "../../../../../core/profile/types";
import { researchCollectible } from "../../../../../server/analysis/run-pipeline";
import { hasDemoAccess } from "../../../../../server/security/demo-access";
import { publicError } from "../../../../../server/security/redact-error";

export const runtime = "nodejs";
export const maxDuration = 300;

type RequestBody = {
  identification?: unknown;
  collectorMode?: unknown;
  collectorEvidence?: CollectorEvidence | null;
  qwenActivity?: ToolActivity | null;
  locale?: unknown;
};

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  if (!hasDemoAccess(request)) return Response.json({ error: "Invalid Access Code." }, { status: 401 });
  const { sessionId: runId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return Response.json({ error: "Invalid analysis run ID." }, { status: 400 });
  let body: RequestBody;
  let identification: DetectionResult;
  try {
    body = await request.json() as RequestBody;
    assertDetectionResult(body.identification);
    identification = body.identification;
    if (typeof body.collectorMode !== "boolean") throw new Error("collectorMode must be a boolean.");
    if (identification.pokemonCard) identification.priceSearchKeywordJa = buildPokemonCardSearchKeyword(identification.pokemonCard);
  } catch (error) {
    return Response.json({ error: publicError(error, "The research input is invalid.") }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ResearchStreamEvent): void => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      void (async () => {
        try {
          const workflow = await researchCollectible({
            runId,
            identification,
            collectorMode: body.collectorMode as boolean,
            collectorEvidence: body.collectorEvidence ?? null,
            qwenActivity: body.qwenActivity?.provider === "Qwen" ? body.qwenActivity : null,
            onStage: (event) => send({ type: "stage", ...event }),
          });
          send({ type: "completed", status: "completed", ...workflow });
        } catch (error) {
          send({ type: "error", status: "failed", error: publicError(error, "The research providers were unavailable.") });
        } finally {
          controller.close();
        }
      })();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
}
