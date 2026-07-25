import { NextResponse } from "next/server";
import { hasDemoAccess } from "../../../server/security/demo-access";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasDemoAccess(request)) return NextResponse.json({ error: "Invalid Access Code." }, { status: 401 });
  return NextResponse.json({ valid: true }, { headers: { "Cache-Control": "no-store" } });
}
