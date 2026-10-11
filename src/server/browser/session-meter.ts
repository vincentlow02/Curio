export type BrowserSessionUsage = {
  sessionId: string;
  transport: "browserless" | "local";
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  estimatedTimeUnits: number | null;
  proxyCaptchaUnits: number | null;
  actualUnits: number | null;
  actualCostUSD: number | null;
};

export function estimateBrowserlessTimeUnits(durationMs: number): number {
  return Math.ceil(Math.max(0, durationMs) / 30_000);
}

export function finishBrowserSessionUsage(session: BrowserSessionUsage, endedAtMs: number, measuredDurationMs?: number): void {
  if (session.endedAt !== null) return;
  session.endedAt = new Date(endedAtMs).toISOString();
  session.durationMs = Math.max(0, Math.round(measuredDurationMs ?? endedAtMs - Date.parse(session.startedAt)));
  session.estimatedTimeUnits = session.transport === "browserless" ? estimateBrowserlessTimeUnits(session.durationMs) : null;
}
