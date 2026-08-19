import "server-only";

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const env = {
  get demoAccessCode() { return process.env.DEMO_ACCESS_CODE?.trim() ?? ""; },
  get fixtureMode() { return process.env.WEB_USE_FIXTURE === "true"; },
  get qwenApiKey() { return process.env.QWEN_API_KEY?.trim() ?? ""; },
  get qwenBaseUrl() { return process.env.QWEN_BASE_URL?.trim().replace(/\/$/, "") ?? ""; },
  get qwenVisionModel() { return process.env.QWEN_VISION_MODEL?.trim() ?? ""; },
  get qwenTextModel() { return process.env.QWEN_TEXT_MODEL?.trim() ?? ""; },
  get tavilyApiKey() { return process.env.TAVILY_API_KEY?.trim(); },
  get daytonaApiKey() { return process.env.DAYTONA_API_KEY?.trim(); },
  get daytonaApiUrl() { return process.env.DAYTONA_API_URL?.trim(); },
  get daytonaTarget() { return process.env.DAYTONA_TARGET?.trim(); },
  get enableTavily() { return process.env.ENABLE_TAVILY_PRICE_FALLBACK !== "false"; },
  get enableDaytona() { return process.env.ENABLE_DAYTONA_PROCESSING === "true"; },
  get headless() { return process.env.PLAYWRIGHT_HEADLESS !== "false"; },
  get browserProvider() {
    if (process.env.BROWSER_PROVIDER?.trim() === "browserless") return "browserless" as const;
    if (process.env.BROWSER_PROVIDER?.trim() === "local") return "local" as const;
    return process.env.VERCEL === "1" ? ("browserless" as const) : ("local" as const);
  },
  get browserlessWsEndpoint() { return process.env.BROWSERLESS_WS_ENDPOINT?.trim(); },
  get browserlessApiToken() { return process.env.BROWSERLESS_API_TOKEN?.trim(); },
  get browserSessionTimeoutSeconds() { return integer("BROWSER_SESSION_TIMEOUT_SECONDS", 55); },
  get researchTimeBudgetSeconds() { return Math.min(integer("RESEARCH_TIME_BUDGET_SECONDS", 240), 240); },
  get maxUploadBytes() { return integer("MAX_UPLOAD_BYTES", 4 * 1024 * 1024); },
  get maxInputTextChars() { return integer("MAX_INPUT_TEXT_CHARS", 2000); },
  get demoRateLimitWindowMinutes() { return integer("DEMO_RATE_LIMIT_WINDOW_MINUTES", 60); },
  get demoRateLimitMaxRequests() { return integer("DEMO_RATE_LIMIT_MAX_REQUESTS", 5); },
  get demoGlobalDailyLimit() { return integer("DEMO_GLOBAL_DAILY_LIMIT", 50); },
};

export function liveReadiness(): Record<string, boolean> {
  return {
    demoAccessCode: process.env.NODE_ENV !== "production" || Boolean(env.demoAccessCode),
    qwenApiKey: Boolean(env.qwenApiKey),
    qwenBaseUrl: Boolean(env.qwenBaseUrl),
    qwenVisionModel: Boolean(env.qwenVisionModel),
    qwenTextModel: Boolean(env.qwenTextModel),
    daytona: !env.enableDaytona || Boolean(env.daytonaApiKey),
    tavily: !env.enableTavily || Boolean(env.tavilyApiKey),
    browser: env.browserProvider === "local" ? process.env.VERCEL !== "1" : Boolean(env.browserlessWsEndpoint && env.browserlessApiToken),
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
