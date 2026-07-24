import { NextResponse } from "next/server";
import { assertDetectionResult } from "../../../../../core/profile/types";
import { buildPokemonCardSearchKeyword } from "../../../../../core/profile/pokemon-card";
import { runResearch } from "../../../../../server/analysis/run-pipeline";
import { analysisQueue } from "../../../../../server/queue/analysis-queue";
import { hasDemoAccess } from "../../../../../server/security/demo-access";
import { publicError } from "../../../../../server/security/redact-error";
import { internalSession, updateSession } from "../../../../../server/sessions/session-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }): Promise<NextResponse> {
  if (!hasDemoAccess(request)) return NextResponse.json({ error: "Invalid Demo Access Code." }, { status: 401 });
  try {
    const { sessionId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: "Invalid analysis session ID." }, { status: 400 });
    const session = internalSession(sessionId);
    if (!session) return NextResponse.json({ error: "The analysis session does not exist or has expired." }, { status: 404 });
    if (session.status === "completed") return NextResponse.json({ sessionId, status: session.status }, { status: 200 });
    if (session.status !== "identified") return NextResponse.json({ error: "Research cannot start from the current session state.", status: session.status }, { status: 409 });
    const body = await request.json() as { identification?: unknown };
    assertDetectionResult(body.identification);
    const identification = body.identification;
    if (identification.pokemonCard) identification.priceSearchKeywordJa = buildPokemonCardSearchKeyword(identification.pokemonCard);
    await updateSession(sessionId, { status: "queued_research", identification, progress: 36, message: "Research has been added to the queue", error: null });
    let queuePosition: number;
    try {
      queuePosition = analysisQueue.enqueue({ id: sessionId, run: () => runResearch(sessionId, identification) });
    } catch (error) {
      await updateSession(sessionId, { status: "identified", progress: 32, message: "Identification complete. Research can be retried shortly.", error: publicError(error) });
      throw error;
    }
    await updateSession(sessionId, { queuePosition });
    return NextResponse.json({ sessionId, status: "queued_research", queuePosition }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 400 });
  }
}
