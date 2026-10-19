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
  userMessageId?: string;
  conversationImagePath?: string;
  followups?: AnalysisFollowup[];
  recognitionSnapshot?: string;
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

export type AnalysisFollowup = {
  userMessageId: string;
  assistantMessageId: string;
  question: string;
  answer: string;
  createdAt: string;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadata: RecentAnalysisRecord | null;
  attachmentName?: string;
  attachmentPath?: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationRecord = ConversationSummary & {
  messages: ConversationMessage[];
};
