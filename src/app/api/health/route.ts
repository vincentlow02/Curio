import { NextResponse } from "next/server";
import { env, liveReadiness } from "../../../server/config/env";

export function GET(): NextResponse {
  const providers = liveReadiness();
  const ready = env.fixtureMode || Object.values(providers).every(Boolean);
  return NextResponse.json({ status: ready ? "ok" : "degraded", mode: env.fixtureMode ? "fixture" : "live", browserProvider: env.browserProvider, providers, timestamp: new Date().toISOString() }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
