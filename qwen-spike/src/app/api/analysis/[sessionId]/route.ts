import { NextResponse } from "next/server";
import { hasDemoAccess } from "../../../../server/security/demo-access";
import { publicSession } from "../../../../server/sessions/session-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }): Promise<NextResponse> {
  if (!hasDemoAccess(request)) return NextResponse.json({ error: "Invalid Demo Access Code." }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: "Invalid analysis session ID." }, { status: 400 });
  const session = await publicSession(sessionId);
  if (!session) return NextResponse.json({ error: "The analysis session does not exist or has expired." }, { status: 404 });
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
}
