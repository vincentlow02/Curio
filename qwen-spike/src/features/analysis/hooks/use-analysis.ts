"use client";
import { useEffect, useState } from "react";
import type { AnalysisSessionView } from "../../../core/analysis/types";

export function useAnalysis(sessionId: string, initial?: AnalysisSessionView): { session: AnalysisSessionView | null; error: string | null; loading: boolean } {
  const [session, setSession] = useState<AnalysisSessionView | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll(): Promise<void> {
      try {
        const demoCode = sessionStorage.getItem("collectible-demo-code") ?? "";
        const response = await fetch(`/api/analysis/${encodeURIComponent(sessionId)}`, { headers: { "X-Demo-Code": demoCode }, cache: "no-store" });
        const body = await response.json() as AnalysisSessionView | { error: string };
        if (!response.ok) throw new Error(("error" in body ? body.error : null) ?? "无法读取任务状态。");
        if (cancelled) return;
        const next = body as AnalysisSessionView;
        setSession(next);
        if (!["completed", "failed", "needs_review"].includes(next.status)) timer = setTimeout(poll, 1500);
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught)); }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, initial]);
  return { session, error, loading: !session && !error };
}
