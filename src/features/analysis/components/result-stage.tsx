import type { AnalysisResult, ToolActivity } from "../../../core/analysis/types";
import type { DetectionResult } from "../../../core/profile/types";
import { uiCopy, type UiLocale } from "../locales";

type ResultStageProps = {
  result: AnalysisResult;
  activities: ToolActivity[];
  locale: UiLocale;
};

const resultIntroClass = "flex items-start gap-[12px]";
const resultIntroHeadingClass = "!m-0 !text-[18px] !leading-[1.25] !font-semibold";
const resultIntroSummaryClass = "!mt-[7px] !mb-0 !max-w-[630px] !text-[#4f4f4f] !text-[14px] !leading-[1.55] max-[767px]:!text-[13px]";

function formatYen(value: number | null): string {
  return value === null ? "—" : `¥${value.toLocaleString("ja-JP")}`;
}

function mapsUrl(keyword: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(keyword)}`;
}

function activityDuration(durationMs: number | null): string {
  if (durationMs === null) return "";
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
}

function areaName(name: string, locale: UiLocale): string {
  const canonical = ({ Akihabara: "秋葉原", Nakano: "中野", Ikebukuro: "池袋", Shinjuku: "新宿", Shibuya: "渋谷" } as Record<string, string>)[name] ?? name;
  const names: Record<UiLocale, Record<string, string>> = {
    en: { "秋葉原": "Akihabara", "中野": "Nakano", "池袋": "Ikebukuro", "新宿": "Shinjuku", "渋谷": "Shibuya" },
    zh: { "秋葉原": "秋叶原", "中野": "中野", "池袋": "池袋", "新宿": "新宿", "渋谷": "涩谷" },
    ja: { "秋葉原": "秋葉原", "中野": "中野", "池袋": "池袋", "新宿": "新宿", "渋谷": "渋谷" },
  };
  return names[locale][canonical] ?? name;
}

function areaReason(name: string, fallback: string, locale: UiLocale): string {
  const canonical = ({ Akihabara: "秋葉原", Nakano: "中野", Ikebukuro: "池袋", Shinjuku: "新宿", Shibuya: "渋谷" } as Record<string, string>)[name] ?? name;
  const reasons: Record<UiLocale, Record<string, string>> = {
    en: {
      "秋葉原": "A dense area for second-hand collectibles, games and specialist hobby shops.",
      "中野": "Specialist collectible shops make this a strong area for character goods and vintage toys.",
      "池袋": "A useful area for comparing game, card and second-hand hobby stores.",
      "新宿": "A strong area for second-hand records, CDs and specialist music retailers.",
      "渋谷": "A well-known record-shopping area with major and independent music stores.",
    },
    zh: {
      "秋葉原": "二手收藏品、游戏和专业模型店高度集中的区域。",
      "中野": "聚集专业收藏店，适合寻找角色商品和复古玩具。",
      "池袋": "适合比较游戏、卡牌和二手爱好用品店。",
      "新宿": "适合寻找二手唱片、CD 和专业音乐零售店。",
      "渋谷": "知名唱片购物区域，汇集大型与独立音乐店。",
    },
    ja: {
      "秋葉原": "中古コレクション、ゲーム、専門ホビー店が集まるエリアです。",
      "中野": "キャラクターグッズやヴィンテージ玩具の専門店が充実しています。",
      "池袋": "ゲーム、カード、中古ホビー店を比較しやすいエリアです。",
      "新宿": "中古レコード、CD、音楽専門店を探しやすいエリアです。",
      "渋谷": "大型店と独立系店舗が集まる有名なレコード街です。",
    },
  };
  return reasons[locale][canonical] ?? fallback;
}

function auctionStatus(status: string, locale: UiLocale): string {
  const labels: Record<UiLocale, Record<string, string>> = {
    en: { succeeded: "succeeded", no_results: "no results", failed: "failed", skipped: "skipped" },
    zh: { succeeded: "已完成", no_results: "无结果", failed: "失败", skipped: "已跳过" },
    ja: { succeeded: "完了", no_results: "結果なし", failed: "失敗", skipped: "スキップ" },
  };
  return labels[locale][status] ?? status.replace("_", " ");
}

function activityCopy(activity: ToolActivity, identification: DetectionResult, sampleCount: number, locale: UiLocale): { title: string; description: string } {
  const valid = activity.validResultCount ?? 0;
  const candidates = activity.resultCount ?? 0;
  if (locale === "zh") {
    switch (activity.provider) {
      case "Qwen": return { title: identification.pokemonCard ? "已识别精确宝可梦卡牌" : "已识别收藏品", description: `Qwen ${activity.model ?? "视觉模型"} 已识别 ${identification.itemName} 并生成日文价格搜索关键词。输入 ${activity.inputTokens ?? 0}／输出 ${activity.outputTokens ?? 0} tokens。` };
      case "Rakuten": return { title: "已搜索乐天", description: `读取 1 个公开搜索页面，发现 ${candidates} 个候选，保留 ${valid} 个可比较样本。` };
      case "Mercari": return { title: "已搜索 Mercari", description: `读取 1 个在售搜索页面，发现 ${candidates} 个候选，保留 ${valid} 个可比较样本。` };
      case "Yahoo Auctions": return activity.status === "skipped" ? { title: "已跳过 Yahoo! 拍卖", description: "未启用收藏家模式。" } : { title: "已检查 Yahoo! 拍卖", description: `发现 ${candidates} 个候选，保留 ${valid} 条可比较的进行中拍卖信号。` };
      case "Mandarake Auction": return activity.status === "skipped" ? { title: "已跳过 Mandarake Auction", description: "未启用收藏家模式。" } : { title: "已检查 Mandarake Auction", description: `发现 ${candidates} 个候选，保留 ${valid} 条可比较信号。` };
      case "Tavily": return activity.status === "skipped" ? { title: "已跳过备用搜索", description: sampleCount > 0 ? "主要来源已有可比较样本，无需备用搜索。" : "本次运行已关闭备用搜索。" } : { title: "已使用受控备用搜索", description: `Tavily 返回 ${candidates} 个候选，保留 ${valid} 个。` };
      case "Node": return { title: "已计算参考范围", description: `Node.js 应用确定性匹配、排除和 MAD 价格规则；${candidates} 个保留样本中有 ${valid} 个纳入参考范围。` };
      case "Daytona":
        if (activity.verificationStatus === "verified") return { title: "已在 Daytona 沙箱验证", description: "隔离沙箱独立复算，结果与 Node.js 一致。" };
        if (activity.verificationStatus === "mismatch") return { title: "沙箱验证结果不同", description: "独立复算不一致，已保留确定性的 Node.js 结果。" };
        if (activity.verificationStatus === "unavailable") return { title: "沙箱验证不可用", description: "Node.js 已完成计算，但 Daytona 无法独立验证。" };
        return { title: "已跳过沙箱验证", description: "使用确定性的 Node.js 计算结果，没有额外运行 Daytona。" };
    }
  }
  if (locale === "ja") {
    switch (activity.provider) {
      case "Qwen": return { title: identification.pokemonCard ? "ポケモンカードを特定" : "コレクションを識別", description: `Qwen ${activity.model ?? "画像モデル"} が ${identification.itemName} を識別し、日本語の価格検索キーワードを生成しました。入力 ${activity.inputTokens ?? 0}／出力 ${activity.outputTokens ?? 0} トークン。` };
      case "Rakuten": return { title: "楽天を検索", description: `公開検索ページを1件読み、候補 ${candidates} 件から比較可能な ${valid} 件を採用しました。` };
      case "Mercari": return { title: "メルカリを検索", description: `販売中検索ページを1件読み、候補 ${candidates} 件から比較可能な ${valid} 件を採用しました。` };
      case "Yahoo Auctions": return activity.status === "skipped" ? { title: "Yahoo!オークションをスキップ", description: "コレクターモードが無効でした。" } : { title: "Yahoo!オークションを確認", description: `候補 ${candidates} 件から比較可能な開催中情報 ${valid} 件を採用しました。` };
      case "Mandarake Auction": return activity.status === "skipped" ? { title: "Mandarake Auctionをスキップ", description: "コレクターモードが無効でした。" } : { title: "Mandarake Auctionを確認", description: `候補 ${candidates} 件から比較可能な情報 ${valid} 件を採用しました。` };
      case "Tavily": return activity.status === "skipped" ? { title: "代替検索をスキップ", description: sampleCount > 0 ? "主要情報源で比較可能なサンプルが得られたため不要でした。" : "今回の代替検索は無効でした。" } : { title: "管理された代替検索を使用", description: `Tavily の候補 ${candidates} 件から ${valid} 件を採用しました。` };
      case "Node": return { title: "参考価格帯を計算", description: `Node.js が決定論的な照合、除外、MAD価格ルールを適用し、${candidates} 件中 ${valid} 件を参考価格帯に使用しました。` };
      case "Daytona":
        if (activity.verificationStatus === "verified") return { title: "Daytonaサンドボックスで検証", description: "隔離サンドボックスの再計算結果がNode.jsと一致しました。" };
        if (activity.verificationStatus === "mismatch") return { title: "サンドボックス検証に差異", description: "再計算が一致しなかったため、決定論的なNode.js結果を保持しました。" };
        if (activity.verificationStatus === "unavailable") return { title: "サンドボックス検証は利用不可", description: "Node.jsの計算は完了しましたが、Daytonaで独立検証できませんでした。" };
        return { title: "サンドボックス検証をスキップ", description: "追加のDaytona検証なしでNode.jsの計算結果を使用しました。" };
    }
  }
  switch (activity.provider) {
    case "Qwen":
      return {
        title: identification.pokemonCard ? "Identified the exact Pokémon card" : "Identified the collectible",
        description: identification.pokemonCard
          ? `Qwen ${activity.model ?? "vision model"} identified ${identification.itemName}, card number ${identification.pokemonCard.cardNumber}, set ${identification.pokemonCard.setCode}, rarity ${identification.pokemonCard.rarity}, and generated an exact Japanese search keyword. ${activity.inputTokens ?? 0} input / ${activity.outputTokens ?? 0} output tokens.`
          : `Qwen ${activity.model ?? "vision model"} identified ${identification.itemName} and generated the Japanese price-search keyword. ${activity.inputTokens ?? 0} input / ${activity.outputTokens ?? 0} output tokens.`,
      };
    case "Rakuten":
      return { title: "Searched Rakuten", description: `Read one public search page, found ${candidates} candidates and retained ${valid} comparable samples.` };
    case "Mercari":
      return { title: "Searched Mercari", description: `Read one on-sale search page, found ${candidates} candidates and retained ${valid} comparable samples.` };
    case "Yahoo Auctions":
      return activity.status === "skipped"
        ? { title: "Skipped Yahoo! Auctions", description: "Collector Mode was not enabled." }
        : { title: "Checked Yahoo! Auctions", description: `Read one public results page, found ${candidates} candidates and retained ${valid} comparable active-auction signals.` };
    case "Mandarake Auction":
      return activity.status === "skipped"
        ? { title: "Skipped Mandarake Auction", description: "Collector Mode was not enabled." }
        : { title: "Checked Mandarake Auction", description: `Read one public specialist-auction page, found ${candidates} candidates and retained ${valid} comparable signals.` };
    case "Tavily":
      return activity.status === "skipped"
        ? { title: "Skipped fallback search", description: sampleCount > 0 ? "Rakuten or Mercari already produced comparable samples, so no fallback search was needed." : "Fallback search was disabled for this run." }
        : { title: "Used controlled fallback search", description: `The primary sources had no usable samples. Tavily returned ${candidates} candidates and ${valid} were retained.` };
    case "Node":
      return { title: "Calculated the reference range", description: `Node.js applied the deterministic matching, exclusion and MAD price rules. ${valid} of ${candidates} retained samples were included in the reference range.` };
    case "Daytona":
      if (activity.verificationStatus === "verified") return { title: "Verified in Daytona Sandbox", description: "The isolated Sandbox independently recalculated the sample decisions and price range, and its output matched the Node.js result." };
      if (activity.verificationStatus === "mismatch") return { title: "Sandbox verification differed", description: "The isolated recalculation did not match. Curio retained the deterministic Node.js result and reported the difference." };
      if (activity.verificationStatus === "unavailable") return { title: "Sandbox verification unavailable", description: "The Node.js calculation completed normally, but Daytona could not independently verify this run." };
      return { title: "Skipped Sandbox verification", description: "The deterministic Node.js calculation was used without an additional Daytona verification run." };
  }
}

export function ResultStage({ result, activities, locale }: ResultStageProps): React.ReactElement {
  const copy = uiCopy[locale];

  return (
    <section className="figma-agent-answer !flex !w-[720px] !max-w-[calc(100%-68px)] !ml-[34px] !flex-col !gap-[22px] max-[767px]:!w-full max-[767px]:!max-w-none max-[767px]:!ml-0 max-[767px]:!gap-[18px]">
      <div className={`figma-agent-answer__intro ${resultIntroClass}`}>
        <div>
          <h2 className={resultIntroHeadingClass}>{copy.result.heading}</h2>
          <p className={resultIntroSummaryClass}>
            {result.priceReference.sampleCount ? copy.result.found(result.priceReference.sampleCount) : copy.result.notEnough}
          </p>
        </div>
      </div>

      <article className="figma-agent-result-card !overflow-hidden !border !border-solid !border-[#e4e4e4] !rounded-[14px] !bg-white">
        <header className="!flex !min-h-[70px] !items-center !justify-between !border-b !border-[#ededed] !px-[18px] !py-[14px] max-[767px]:!px-[14px] max-[767px]:!py-[13px]">
          <div>
            <span className="!text-[#777] !text-[10px] !font-semibold !tracking-[0.08em]">{copy.result.priceReference}</span>
            <h3 className="!mt-[4px] !text-[16px] !font-semibold max-[767px]:![overflow-wrap:anywhere]">{result.identification.itemName}</h3>
          </div>
          <b className="!rounded-[7px] !bg-[#f1f1f1] !px-[8px] !py-[5px] !text-[10px] !tracking-[0.08em]">JPY</b>
        </header>
        <div className="figma-agent-price-range !grid !grid-cols-[repeat(3,1fr)] max-[767px]:!grid-cols-[1fr]">
          <div className="!flex !min-h-[88px] !flex-col !gap-[7px] !border-r !border-r-solid !border-[#ededed] !px-[18px] !py-[17px] last:!border-r-0 max-[767px]:!min-h-[68px] max-[767px]:!border-r-0 max-[767px]:!border-b-solid max-[767px]:!border-b max-[767px]:!px-[15px] max-[767px]:!py-[13px] last:max-[767px]:!border-b-0">
            <span className="!text-[#777] !text-[11px]">{copy.result.low}</span>
            <strong className="!text-[23px] !leading-none !font-[550] !tracking-[-0.5px]">{formatYen(result.priceReference.low)}</strong>
          </div>
          <div className="is-median !flex !min-h-[88px] !flex-col !gap-[7px] !border-r !border-r-solid !border-[#ededed] !bg-[#fafafa] !px-[18px] !py-[17px] last:!border-r-0 max-[767px]:!min-h-[68px] max-[767px]:!border-r-0 max-[767px]:!border-b-solid max-[767px]:!border-b max-[767px]:!px-[15px] max-[767px]:!py-[13px] last:max-[767px]:!border-b-0">
            <span className="!text-[#777] !text-[11px]">{copy.result.typical}</span>
            <strong className="!text-[23px] !leading-none !font-[550] !tracking-[-0.5px]">{formatYen(result.priceReference.median)}</strong>
          </div>
          <div className="!flex !min-h-[88px] !flex-col !gap-[7px] !border-r !border-r-solid !border-[#ededed] !px-[18px] !py-[17px] last:!border-r-0 max-[767px]:!min-h-[68px] max-[767px]:!border-r-0 max-[767px]:!border-b-solid max-[767px]:!border-b max-[767px]:!px-[15px] max-[767px]:!py-[13px] last:max-[767px]:!border-b-0">
            <span className="!text-[#777] !text-[11px]">{copy.result.high}</span>
            <strong className="!text-[23px] !leading-none !font-[550] !tracking-[-0.5px]">{formatYen(result.priceReference.high)}</strong>
          </div>
        </div>
        <p className="figma-agent-result-note !border-t !border-t-solid !border-[#ededed] !px-[18px] !py-[11px] !text-[#777] !text-[11px]">
          {copy.result.basedOn(result.priceReference.sampleCount)}
        </p>
      </article>

      {result.collectorMode && result.collectorEvidence ? (
        <div className="figma-agent-section figma-collector-evidence">
          <h3>{copy.collectorEvidence}</h3>
          <div className="figma-collector-evidence-grid grid grid-cols-2 gap-[10px] max-[767px]:grid-cols-1">
            <article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]">
              <b className="!text-[11px]">{copy.result.editionSignals}</b>
              <ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">
                {result.collectorEvidence.editionSignals.length ? result.collectorEvidence.editionSignals.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}
              </ul>
            </article>
            <article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]">
              <b className="!text-[11px]">{copy.result.visibleCondition}</b>
              <ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">
                {result.collectorEvidence.conditionSignals.length ? result.collectorEvidence.conditionSignals.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}
              </ul>
            </article>
            <article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]">
              <b className="!text-[11px]">{copy.result.visibleIdentifiers}</b>
              <ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">
                {result.collectorEvidence.visibleIdentifiers.length ? result.collectorEvidence.visibleIdentifiers.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}
              </ul>
            </article>
            <article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]">
              <b className="!text-[11px]">{copy.result.missingEvidence}</b>
              <ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">
                {result.collectorEvidence.missingEvidence.length ? result.collectorEvidence.missingEvidence.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noMissingEvidence}</li>}
              </ul>
            </article>
          </div>
        </div>
      ) : null}

      {result.collectorMode ? (
        <div className="figma-agent-section figma-auction-watch">
          <h3>{copy.result.auctionWatch}</h3>
          <p className="figma-auction-disclaimer !mt-[-3px] !mr-0 !mb-[10px] !ml-0 !text-[#777] !text-[10px]">{copy.result.auctionDisclaimer}</p>
          {result.auctionSources.map((source) => (
            <article className="!mt-[10px] !overflow-hidden !rounded-[11px] !border !border-solid !border-[#e4e4e4] !bg-white" key={source.source}>
              <header className="!flex !items-center !justify-between !border-0 !border-b !border-solid !border-[#ededed] !px-[13px] !py-[11px]">
                <div className="!flex !items-center !gap-[9px]">
                  <b className="!text-[12px]">{source.source === "Yahoo Auctions" ? "Yahoo! Auctions" : source.source}</b>
                  <span className="!text-[#888] !text-[9px]">{copy.result.comparableSignals(source.comparableSignals)}</span>
                </div>
                <small className="!text-[#888] !text-[9px]">{auctionStatus(source.status, locale)}</small>
              </header>
              {source.signals.length ? (
                <div>
                  {source.signals.map((signal) => (
                    <a className="!grid !grid-cols-[minmax(0,1fr)_auto] !gap-[16px] !border-t !border-x-0 !border-b-0 !border-solid !border-[#f0f0f0] !px-[13px] !py-[12px] !text-inherit !no-underline first:!border-t-0 max-[767px]:!grid-cols-1" href={signal.url} target="_blank" rel="noreferrer" key={signal.url}>
                      <div className="!flex !min-w-0 !flex-col !gap-[3px]">
                        <b className="!overflow-hidden !text-ellipsis !whitespace-nowrap !text-[11px]">{signal.title}</b>
                        <span className="!text-[#808080] !text-[9px]">{signal.bidCount === null ? copy.result.bidsUnknown : copy.result.bids(signal.bidCount)} · {signal.remainingTime}</span>
                        {signal.unresolvedDifferences.length ? <small className="!text-[#808080] !text-[9px]">{signal.unresolvedDifferences.join(" · ")}</small> : null}
                      </div>
                      <dl className="!m-0 !flex !gap-[12px] max-[767px]:!flex-wrap max-[767px]:!justify-start">
                        <div className="!text-right max-[767px]:!text-left"><dt className="!text-[#888] !text-[8px]">{copy.result.current}</dt><dd className="!mt-[2px] !mr-0 !mb-0 !ml-0 !text-[11px] !font-[600]">{formatYen(signal.currentPrice)}</dd></div>
                        {signal.startingPrice !== null ? <div className="!text-right max-[767px]:!text-left"><dt className="!text-[#888] !text-[8px]">{copy.result.starting}</dt><dd className="!mt-[2px] !mr-0 !mb-0 !ml-0 !text-[11px] !font-[600]">{formatYen(signal.startingPrice)}</dd></div> : null}
                        {signal.buyNowPrice !== null ? <div className="!text-right max-[767px]:!text-left"><dt className="!text-[#888] !text-[8px]">{copy.result.buyNow}</dt><dd className="!mt-[2px] !mr-0 !mb-0 !ml-0 !text-[11px] !font-[600]">{formatYen(signal.buyNowPrice)}</dd></div> : null}
                      </dl>
                    </a>
                  ))}
                </div>
              ) : <p className="figma-auction-empty !m-0 !p-[13px] !text-[#777] !text-[10px]">{copy.result.noAuctionSignals}</p>}
            </article>
          ))}
        </div>
      ) : null}

      <div className="figma-agent-section">
        <h3>{copy.result.whereToLook}</h3>
        <div className="figma-agent-area-grid grid grid-cols-2 gap-[10px] max-[767px]:grid-cols-1">
          {result.recommendedAreas.map((area) => (
            <article className="min-h-[135px] rounded-[12px] border border-solid border-[#e5e5e5] bg-white p-[15px]" key={area.area}>
              <b className="text-[15px]">{areaName(area.area, locale)}</b>
              <p className="!mt-[6px] !mr-0 !mb-[12px] !ml-0 !text-[#5f5f5f] !text-[12px] !leading-[1.5]">{areaReason(area.area, area.reason, locale)}</p>
              <code className="block overflow-hidden rounded-[6px] bg-[#f5f5f5] px-[8px] py-[7px] !text-[#333] !text-[11px] !font-normal !leading-[1.3] ![font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] text-ellipsis whitespace-nowrap" lang="ja">{area.searchKeywordJa}</code>
              <a className="mt-[10px] inline-block !text-[#333] !text-[11px] !font-[550] [text-underline-offset:3px]" href={mapsUrl(area.searchKeywordJa)} target="_blank" rel="noreferrer">{copy.result.openMaps}</a>
            </article>
          ))}
        </div>
      </div>

      {result.storeSuggestions.length ? (
        <div className="figma-agent-section">
          <h3>{copy.result.storeSuggestions}</h3>
          <div className="figma-store-suggestions flex flex-col overflow-hidden rounded-[11px] border border-solid border-[#e5e5e5] bg-white">
            {result.storeSuggestions.map((store) => (
              <a className="flex flex-col gap-[3px] border-b border-solid border-[#eee] px-[13px] py-[11px] !text-[#222] no-underline last:border-b-0 hover:[&_b]:underline" href={store.sourceUrl} target="_blank" rel="noreferrer" key={`${store.name}-${store.sourceUrl}`}>
                <b>{store.name}</b>
                <span className="!text-[#666] !text-[11px]">{copy.result.storeReason}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <details className="figma-agent-sources !overflow-hidden !border-x-0 !border-t !border-b !border-solid !border-[#e7e7e7]">
        <summary className="!flex !items-center !justify-between !cursor-pointer !px-[2px] !py-[10px] !font-[550] list-none [&::-webkit-details-marker]:hidden">
          <span>{copy.result.viewSources}</span>
          <span className="figma-source-brand-stack flex !items-center !pr-[3px]" aria-hidden="true">
            <span className="!grid !h-[30px] !w-[30px] !place-items-center !overflow-hidden !rounded-full !border !border-solid !border-[#e5e5e5] !bg-white !shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <img className="!block !h-[20px] !w-[20px] !object-contain" src="/brands/rakuten.ico" alt="" />
            </span>
            <span className="!-ml-[7px] !grid !h-[30px] !w-[30px] !place-items-center !overflow-hidden !rounded-full !border !border-solid !border-[#e5e5e5] !bg-white !shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <img className="!block !h-[20px] !w-[20px] !object-contain" src="/brands/mercari.ico" alt="" />
            </span>
          </span>
        </summary>
        <div className="!px-0 !pt-0 !pb-[10px]">
          {result.priceReference.samples.map((sample) => (
            <a className="!grid !min-h-[39px] !grid-cols-[70px_1fr_auto] !items-center !gap-[12px] !text-[#222] !no-underline max-[767px]:!grid-cols-[36px_minmax(0,1fr)_auto] max-[767px]:!gap-[8px] [@media(max-width:390px)]:[&&]:!grid-cols-[32px_minmax(0,1fr)] [&_span]:!text-[#777] [&_span]:!text-[11px] hover:[&_p]:!underline" href={sample.url} target="_blank" rel="noreferrer" key={`${sample.source}-${sample.url}`}>
              <span className="figma-marketplace-brand !grid !h-[28px] !w-[28px] !place-items-center !overflow-hidden !rounded-[8px] !border !border-solid !border-[#ededed] !bg-white">
                {sample.source === "Web fallback" ? "W" : <img className="!block !h-[20px] !w-[20px] !object-contain" src={sample.source === "Rakuten" ? "/brands/rakuten.ico" : "/brands/mercari.ico"} alt="" />}
                <span className="sr-only">{sample.source}</span>
              </span>
              <p className="!overflow-hidden !text-ellipsis !whitespace-nowrap max-[767px]:!text-[11px]">{sample.title}</p>
              <b className="!font-[550] [@media(max-width:390px)]:[&&]:!col-start-2">{formatYen(sample.price)}</b>
            </a>
          ))}
        </div>
      </details>

      <details className="figma-run-details !overflow-hidden !rounded-[11px] !border !border-solid !border-[#e5e5e5] !bg-white">
        <summary className="!flex !items-center !justify-between !cursor-pointer !list-none !px-[14px] !py-[13px] !font-[600] max-[767px]:!items-start max-[767px]:!gap-[8px] [&::-webkit-details-marker]:hidden">
          <span>{copy.result.runDetails}</span>
          <small className="!text-[#888] !text-[10px] !font-[450]">{copy.result.steps(activities.length)} · {activityDuration(result.cost.totalMs)}</small>
        </summary>
        <ol className="!m-0 !list-none !px-[14px] !pt-0 !pb-[13px]">
          {activities.map((activity) => {
            const activityText = activityCopy(activity, result.identification, result.priceReference.sampleCount, locale);
            const effectiveStatus = result && activity.status === "running" ? "succeeded" : activity.status;
            const markerStatusClass = effectiveStatus === "skipped"
              ? "!border !border-solid !border-[#c9c9c9] !bg-white !text-[#888]"
              : effectiveStatus === "failed" || effectiveStatus === "fallback"
                ? "!bg-[#777]"
                : "";
            return (
              <li className={`is-${effectiveStatus} relative grid min-h-[58px] grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-[10px] !border-0 !border-t !border-solid !border-[#eee] px-0 py-[10px] max-[767px]:!grid-cols-[22px_minmax(0,1fr)] [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:top-[34px] [&:not(:last-child)]:after:-bottom-[12px] [&:not(:last-child)]:after:left-[8px] [&:not(:last-child)]:after:w-px [&:not(:last-child)]:after:bg-[#dedede] [&:not(:last-child)]:after:content-['']`} key={activity.provider}>
                <span className={`figma-run-marker relative z-[1] grid h-[17px] w-[17px] place-items-center rounded-full bg-[#111] text-[9px] leading-none text-white ${markerStatusClass}`}>{effectiveStatus === "skipped" ? "—" : effectiveStatus === "failed" || effectiveStatus === "fallback" ? "!" : "✓"}</span>
                <div className="min-w-0">
                  <b className="!block !text-[#222] !text-[12px] !font-[600]">{activityText.title}</b>
                  <p className="!mt-[3px] !mr-0 !mb-0 !ml-0 !text-[#707070] !text-[11px] !leading-[1.45]">{activityText.description}</p>
                </div>
                <time className="!pt-[1px] !text-[#999] !text-[10px] !whitespace-nowrap max-[767px]:!col-start-2 max-[767px]:!row-start-2 max-[767px]:!pt-0">{activityDuration(activity.durationMs)}</time>
              </li>
            );
          })}
          <li className="is-succeeded is-total relative grid min-h-[58px] grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-[10px] !border-0 !border-t !border-solid !border-[#eee] px-0 !pt-[10px] !pb-[2px] max-[767px]:!grid-cols-[22px_minmax(0,1fr)] [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:top-[34px] [&:not(:last-child)]:after:-bottom-[12px] [&:not(:last-child)]:after:left-[8px] [&:not(:last-child)]:after:w-px [&:not(:last-child)]:after:bg-[#dedede] [&:not(:last-child)]:after:content-['']">
            <span className="figma-run-marker relative z-[1] grid h-[17px] w-[17px] place-items-center rounded-full bg-[#111] text-[9px] leading-none text-white">✓</span>
            <div className="min-w-0">
              <b className="!block !text-[#222] !text-[12px] !font-[600]">{copy.result.completedRun}</b>
              <p className="!mt-[3px] !mr-0 !mb-0 !ml-0 !text-[#707070] !text-[11px] !leading-[1.45]">{copy.result.completedRunDescription(result.priceReference.sampleCount)}</p>
            </div>
            <time className="!pt-[1px] !text-[#999] !text-[10px] !whitespace-nowrap max-[767px]:!col-start-2 max-[767px]:!row-start-2 max-[767px]:!pt-0">{activityDuration(result.cost.totalMs)}</time>
          </li>
        </ol>
      </details>
    </section>
  );
}
