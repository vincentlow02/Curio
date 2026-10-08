import type { AnalysisResult, AnalysisStage, ToolActivity } from "../../core/analysis/types";
import type { CollectibleCategory, DetectionResult } from "../../core/profile/types";

export type PendingInput = {
  file: File | null;
  text: string;
  category: CollectibleCategory | null;
  collectorMode: boolean;
};

export type RecentAnalysisRecord = {
  id: string;
  title: string;
  submittedText: string;
  recognition: DetectionResult | null;
  result: AnalysisResult | null;
  toolActivity: ToolActivity[];
  status?: AnalysisStage;
  collectorMode?: boolean;
  imageName?: string;
  createdAt: string;
};
