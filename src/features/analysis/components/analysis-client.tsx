"use client";
import type { AnalysisSessionView } from "../../../core/analysis/types";
import { useAnalysis } from "../hooks/use-analysis";
import { AnalysisView } from "./analysis-view";

export function AnalysisClient({ sessionId, initial }: { sessionId: string; initial?: AnalysisSessionView }): React.ReactElement {
  const { session, error, loading } = useAnalysis(sessionId, initial);
  if (loading) return <section className="analysis-shell"><div className="progress-panel"><p>Loading analysis…</p></div></section>;
  if (error || !session) return <section className="analysis-shell"><div className="error-panel"><h1>Unable to load analysis</h1><p>{error ?? "Unknown error"}</p></div></section>;
  return <AnalysisView session={session} />;
}
