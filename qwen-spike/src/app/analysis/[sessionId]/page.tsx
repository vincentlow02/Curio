import { Shell } from "../../../components/ui/brand";
import { AnalysisClient } from "../../../features/analysis/components/analysis-client";

export default async function AnalysisPage({ params }: { params: Promise<{ sessionId: string }> }): Promise<React.ReactElement> {
  const { sessionId } = await params;
  return <Shell><AnalysisClient sessionId={sessionId} /></Shell>;
}
