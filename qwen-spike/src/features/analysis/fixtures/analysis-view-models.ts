import type { AnalysisSessionView } from "../../../core/analysis/types";
import { fixtureResult } from "../../../server/analysis/fixture-result";
import type { FixtureState } from "../types";

const now = new Date(0).toISOString();
const stages: Record<FixtureState, Partial<AnalysisSessionView>> = {
  queued: { status: "queued", progress: 4, message: "等待前一个分析完成", queuePosition: 2 },
  identifying: { status: "identifying", progress: 18, message: "正在识别收藏品" },
  searching_marketplaces: { status: "searching_marketplaces", progress: 42, message: "正在读取 Rakuten 与 Mercari 挂牌样本" },
  searching_fallback: { status: "searching_fallback", progress: 60, message: "正在执行一次受控备用搜索" },
  processing_prices: { status: "processing_prices", progress: 82, message: "正在去重并计算价格区间" },
  success: { status: "completed", progress: 100, message: "分析完成", result: fixtureResult() },
  insufficient_price: { status: "completed", progress: 100, message: "识别完成，价格样本不足", result: { ...fixtureResult(), priceReference: { ...fixtureResult().priceReference, low: null, median: null, high: null, sampleCount: 0, samples: [] }, warnings: ["没有取得足够的可比较挂牌样本。"] } },
  partial_failure: { status: "completed", progress: 100, message: "分析完成，部分来源不可用", result: { ...fixtureResult(), warnings: ["Mercari 暂时无法读取，当前区间仅来自 Rakuten。"] } },
  needs_review: { status: "needs_review", progress: 100, message: "需要重新确认图片", error: "无法可靠判断收藏品类别，请换一张更清晰的图片。" },
  failed: { status: "failed", progress: 100, message: "分析失败", error: "分析服务暂时不可用，请稍后重试。" },
  expired: { status: "failed", progress: 100, message: "任务已过期", error: "任务不存在或已经过期。" },
};

export function fixtureSession(state: FixtureState): AnalysisSessionView {
  return { id: `fixture-${state}`, status: "queued", queuePosition: null, progress: 0, message: "", createdAt: now, updatedAt: now, result: null, error: null, ...stages[state] };
}
