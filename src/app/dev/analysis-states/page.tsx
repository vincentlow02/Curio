import { notFound } from "next/navigation";
import { AnalysisView } from "../../../features/analysis/components/analysis-view";
import { fixtureSession } from "../../../features/analysis/fixtures/analysis-view-models";
import type { FixtureState } from "../../../features/analysis/fixtures/analysis-view-models";

const states: FixtureState[] = ["queued", "identifying", "searching_marketplaces", "searching_fallback", "processing_prices", "success", "insufficient_price", "partial_failure", "needs_review", "failed", "expired"];

export default function AnalysisStatesPage(): React.ReactElement {
  if (process.env.NODE_ENV === "production") notFound();
  return <main className="state-gallery"><h1>Analysis UI states</h1>{states.map((state) => <section key={state}><h2>{state}</h2><AnalysisView session={fixtureSession(state)} /></section>)}</main>;
}
