import "server-only";
import { env, liveReadiness } from "../../../server/config/env";

export const runtime = "nodejs";

export async function GET() {
  const diagnosis = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    config: {
      browserProvider: env.browserProvider,
      browserlessWsEndpoint: env.browserlessWsEndpoint ? "✅ configured" : "❌ missing",
      browserlessApiToken: env.browserlessApiToken ? "✅ configured" : "❌ missing",
      qwenApiKey: env.qwenApiKey ? "✅ configured" : "❌ missing",
      qwenBaseUrl: env.qwenBaseUrl ? "✅ configured" : "❌ missing",
      qwenVisionModel: env.qwenVisionModel ? "✅ configured" : "❌ missing",
      tavilyApiKey: env.tavilyApiKey ? "✅ configured" : "❌ missing",
      daytonaApiKey: env.daytonaApiKey ? "✅ configured" : "❌ missing",
    },
    readiness: liveReadiness(),
  };
  
  return Response.json(diagnosis, { status: 200 });
}
