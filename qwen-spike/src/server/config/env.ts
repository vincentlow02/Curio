import "server-only";

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const env = {
  fixtureMode: process.env.WEB_USE_FIXTURE === "true",
  qwenApiKey: process.env.QWEN_API_KEY?.trim() ?? "",
  qwenBaseUrl: process.env.QWEN_BASE_URL?.trim().replace(/\/$/, "") ?? "",
  qwenVisionModel: process.env.QWEN_VISION_MODEL?.trim() ?? "",
  qwenTextModel: process.env.QWEN_TEXT_MODEL?.trim() ?? "",
  tavilyApiKey: process.env.TAVILY_API_KEY?.trim(),
  daytonaApiKey: process.env.DAYTONA_API_KEY?.trim(),
  daytonaApiUrl: process.env.DAYTONA_API_URL?.trim(),
  daytonaTarget: process.env.DAYTONA_TARGET?.trim(),
  enableTavily: process.env.ENABLE_TAVILY_PRICE_FALLBACK !== "false",
  enableDaytona: process.env.ENABLE_DAYTONA_PROCESSING === "true",
  headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  sessionTtlMinutes: integer("SESSION_TTL_MINUTES", 60),
  analysisTimeoutSeconds: integer("ANALYSIS_TIMEOUT_SECONDS", 90),
  maxUploadBytes: integer("MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
  maxInputTextChars: integer("MAX_INPUT_TEXT_CHARS", 2000),
  maxAnalysesPerIp: integer("MAX_ANALYSES_PER_IP", 50),
  maxQueued: integer("MAX_QUEUED_ANALYSES", 3),
};

export function liveReadiness(): Record<string, boolean> {
  return {
    qwenApiKey: Boolean(env.qwenApiKey),
    qwenBaseUrl: Boolean(env.qwenBaseUrl),
    qwenVisionModel: Boolean(env.qwenVisionModel),
    qwenTextModel: Boolean(env.qwenTextModel),
    daytona: !env.enableDaytona || Boolean(env.daytonaApiKey),
    tavily: !env.enableTavily || Boolean(env.tavilyApiKey),
  };
}

export function assertLiveConfiguration(mode: "image" | "text" = "image"): void {
  const missing = [
    !env.qwenApiKey && "QWEN_API_KEY",
    !env.qwenBaseUrl && "QWEN_BASE_URL",
    mode === "image" && !env.qwenVisionModel && "QWEN_VISION_MODEL",
    mode === "text" && !env.qwenTextModel && "QWEN_TEXT_MODEL",
  ].filter(Boolean);
  if (missing.length) throw new Error(`The server is missing environment variables: ${missing.join(", ")}`);
}
