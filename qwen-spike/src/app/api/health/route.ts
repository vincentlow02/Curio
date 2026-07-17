import { NextResponse } from "next/server";
import { analysisQueue } from "../../../server/queue/analysis-queue";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", queue: analysisQueue.state(), timestamp: new Date().toISOString() });
}
