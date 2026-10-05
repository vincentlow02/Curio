"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, AnalysisSessionView, AnalysisStage, CollectorEvidence, ResearchStreamEvent, ToolActivity } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { buildPokemonCardSearchKeyword } from "../../../core/profile/pokemon-card";
import { COLLECTIBLE_CATEGORIES, type CollectibleCategory, type DetectionResult, type PokemonCardIdentity } from "../../../core/profile/types";
import { uiCopy, type UiLocale } from "../locales";
import { loadRecentImage, saveRecentImage } from "../storage/recent-image-store";
import { compressUpload } from "../lib/compress-upload";

const categories = [
  { id: "toys", title: "Toys & Character Collectibles" as CollectibleCategory, label: <>Toys &amp; Character<br />Collectibles</>, image: "/figma/category-toys.png" },
  { id: "games", title: "Cards & Game Collectibles" as CollectibleCategory, label: <>Cards &amp; Game<br />Collectibles</>, image: "/figma/category-games.png" },
  { id: "music", title: "Records & Music Collectibles" as CollectibleCategory, label: <>Records &amp; Music<br />Collectibles</>, image: "/figma/category-music.png" },
] as const;

const researchSteps = ["searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"] as const;

const researchOrder: AnalysisStage[] = ["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"];

const recognitionDetailLabelClass = "!m-0 !font-normal";
const recognitionDetailValueClass = "!m-0 !w-[172px] !text-[13px] !font-medium !tracking-[-0.26px] ![overflow-wrap:anywhere] max-[767px]:!w-full max-[767px]:!min-w-0";
const recognitionDetailsClass = "!m-0 !flex !w-[361px] !flex-col !gap-[13px] !text-[12px] !leading-[normal] !tracking-[-0.24px] max-[767px]:!w-full max-[767px]:!gap-[12px]";
const recognitionDetailRowClass = "!grid !grid-cols-[125px_1fr] !gap-x-[64px] !items-start max-[767px]:!grid-cols-[105px_minmax(0,1fr)] max-[767px]:!gap-x-[10px] max-[391px]:!grid-cols-1 max-[391px]:!gap-y-[5px]";
const recognitionFieldClass = "!block !h-[25px] !w-[172px] !my-[-5px] !px-[7px] !py-[4px] !border !border-solid !border-transparent !rounded-[6px] !outline-none !appearance-none !bg-transparent !text-black !font-medium !text-[13px] !leading-[15px] !tracking-[-0.26px] !text-ellipsis !transition-[border-color,background-color,box-shadow] !duration-[140ms] !ease-[ease] hover:!border-[#d9d9d9] hover:!bg-white focus:!border-[#b8b8b8] focus:!bg-white focus:!shadow-[0_0_0_2px_rgba(0,0,0,0.05)] disabled:!cursor-default disabled:!opacity-100 disabled:![-webkit-text-fill-color:#000] disabled:hover:!border-transparent disabled:hover:!bg-transparent max-[767px]:!w-full max-[767px]:!min-w-0 max-[391px]:!h-[32px] max-[391px]:!my-0 max-[391px]:!border-[#e4e4e4] max-[391px]:!bg-white";
const recognitionMainClass = "!flex !w-[554px] !h-[171px] !flex-row !items-center !gap-[46px] !overflow-hidden max-[767px]:!w-full max-[767px]:!h-auto max-[767px]:!flex-col max-[767px]:!items-start max-[767px]:!gap-[15px] max-[767px]:!overflow-visible";
const recognitionActionsClass = "!absolute !right-[20px] !bottom-[15px] !flex !items-center !gap-[10px] max-[767px]:!relative max-[767px]:!inset-auto max-[767px]:!mt-[18px] max-[767px]:!justify-end max-[391px]:!w-full";
const recognitionAnalyzingCardClass = "!flex !flex-row !items-center !gap-[28px] max-[767px]:!flex-col max-[767px]:!items-start max-[767px]:!gap-[18px]";
const recognitionLoadingImageClass = "!h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[linear-gradient(100deg,#e3e3e3_20%,#f3f3f3_40%,#e3e3e3_60%)] ![background-size:220%_100%] max-[767px]:!h-[112px] max-[767px]:!w-[112px]";
const recognitionLoadingCopyClass = "!flex !flex-col !items-start !gap-[10px] !text-black";
const recognitionLoadingTitleClass = "!text-[15px] !font-medium";
const recognitionLoadingDescriptionClass = "!text-[12px] !text-[#777] max-[767px]:!leading-[1.45]";
const recognitionLoadingDotsClass = "!mt-[3px] !flex !gap-[4px]";
const recognitionLoadingDotClass = "!h-[5px] !w-[5px] !rounded-full !bg-[#111]";
const recognitionCardClass = "!relative !w-full !min-h-[202px] !overflow-hidden !border !border-solid !border-[#e6e6e6] !rounded-[14px] !bg-white !p-[15px_21px] !text-black animate-[figma-chat-enter_260ms_cubic-bezier(0.22,1,0.36,1)_both] max-[767px]:!min-h-0 max-[767px]:!overflow-visible max-[767px]:!p-[14px]";
const researchProgressClass = "!w-[680px] !ml-[34px] !px-0 !pt-[18px] !pb-[8px] !text-[#181818] !text-[13px] !font-normal !leading-[1.45] [font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] max-[767px]:!w-full max-[767px]:!max-w-none max-[767px]:!ml-0 max-[767px]:!pt-[8px]";
const researchHeadingClass = "flex items-start gap-[12px]";
const researchSpinnerClass = "h-[17px] w-[17px] flex-none mt-[1px] border-2 border-solid border-[#dedede] border-t-[#111] rounded-full";
const researchHeadingTitleClass = "block text-[14px] font-semibold";
const researchHeadingDescriptionClass = "mt-[3px] mb-0 text-[12px] text-[#777]";
const researchStepsClass = "mt-[17px] mb-0 ml-[8px] border-l border-solid border-[#e3e3e3] border-y-0 border-r-0 pl-[8px] pr-0 pt-0 pb-0 list-none";
const researchStepClass = "flex min-h-[32px] items-start gap-[10px] text-[#a0a0a0]";
const researchStepMarkerClass = "grid h-[14px] w-[14px] place-items-center ml-[-15.5px] border border-solid border-[#d7d7d7] rounded-full bg-[#fcfcfc] text-white text-[9px] leading-[1]";
const researchStepTextClass = "mt-[-2px] mb-0";
const resultIntroClass = "flex items-start gap-[12px]";
const resultIntroHeadingClass = "!m-0 !text-[18px] !leading-[1.25] !font-semibold";
const resultIntroSummaryClass = "!mt-[7px] !mb-0 !max-w-[630px] !text-[#4f4f4f] !text-[14px] !leading-[1.55] max-[767px]:!text-[13px]";
const recognitionSelectClass = `${recognitionFieldClass} !cursor-pointer`;

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

type Props = {
  locale?: UiLocale;
  initialHistory?: RecentAnalysisRecord | null;
  onHistorySave?: (record: RecentAnalysisRecord) => void;
  onHistoryPromote?: (id: string) => void;
  onBusyChange?: (busy: boolean) => void;
};

type SelectedImage = { file: File; name: string; url: string };
type PendingInput = { file: File | null; text: string; category: CollectibleCategory | null; collectorMode: boolean };

function formatYen(value: number | null): string {
  return value === null ? "—" : `¥${value.toLocaleString("ja-JP")}`;
}

function mapsUrl(keyword: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(keyword)}`;
}

function stageIndex(status: AnalysisStage): number {
  const index = researchOrder.indexOf(status);
  return index < 0 ? 0 : index;
}

function activityDuration(durationMs: number | null): string {
  if (durationMs === null) return "";
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
}

function stageMessage(status: AnalysisStage | null, locale: UiLocale, fallback?: string): string {
  const messages = uiCopy[locale].stages;
  return (status && messages[status]) || fallback || messages.starting;
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

function errorCopy(message: string | null | undefined): string {
  if (!message) return "The analysis could not continue.";
  if (/无法可靠判断收藏品类别/.test(message)) return "The collectible category could not be identified reliably. Try a clearer image or add the brand and model.";
  if (/任务不存在|已经过期/.test(message)) return "The analysis session does not exist or has expired.";
  if (/分析服务暂时不可用/.test(message)) return "The analysis service is temporarily unavailable. Please try again.";
  return message;
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

export function AnalysisComposer({ locale = "en", initialHistory = null, onHistorySave, onHistoryPromote, onBusyChange }: Props): React.ReactElement {
  const copy = uiCopy[locale];
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<(typeof categories)[number] | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [collectorMode, setCollectorMode] = useState(initialHistory?.result?.collectorMode ?? initialHistory?.collectorMode ?? false);
  const [submittedText, setSubmittedText] = useState(initialHistory?.submittedText ?? "");
  const [sessionId, setSessionId] = useState<string | null>(initialHistory?.result ? null : initialHistory?.id ?? null);
  const [session, setSession] = useState<AnalysisSessionView | null>(null);
  const [historyView, setHistoryView] = useState(initialHistory);
  const [recognitionDraft, setRecognitionDraft] = useState<DetectionResult | null>(initialHistory?.recognition ?? null);
  const [creating, setCreating] = useState(false);
  const [clarificationRequested, setClarificationRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextText, setNextText] = useState("");
  const [nextFile, setNextFile] = useState<File | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [researchStarting, setResearchStarting] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextFileInputRef = useRef<HTMLInputElement>(null);
  const itemNameInputRef = useRef<HTMLInputElement>(null);

  const status: AnalysisStage | null = session?.status ?? historyView?.status ?? (historyView ? (historyView.result ? "completed" : historyView.recognition ? "identified" : "queued") : creating ? "queued" : null);
  const result = session?.result ?? historyView?.result ?? null;
  const activities = session?.toolActivity ?? historyView?.toolActivity ?? [];
  const isConversation = status !== null;
  const isResearch = status !== null && ["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"].includes(status);
  const isBusy = creating || researchStarting || (status !== null && ["queued", "identifying", "queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"].includes(status));
  const submitActive = Boolean(selectedImage || query.trim());

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    setSpeechSupported("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    if (!initialHistory?.id || !initialHistory.imageName) return;
    let cancelled = false;
    void loadRecentImage(initialHistory.id).then((file) => {
      if (cancelled || !file) return;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setSelectedImage({ file, name: file.name, url });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [initialHistory?.id, initialHistory?.imageName]);

  useEffect(() => {
    if (!onHistorySave || !status) return;
    const id = sessionId ?? historyView?.id;
    if (!id) return;
    const savedRecognition = recognitionDraft ?? session?.identification ?? historyView?.recognition ?? null;
    const savedImageName = selectedImage?.name ?? historyView?.imageName;
    onHistorySave({
      id,
      title: savedRecognition?.itemName || submittedText || "Analyzing collectible…",
      submittedText,
      recognition: savedRecognition,
      result,
      toolActivity: activities,
      status,
      collectorMode: session?.collectorMode ?? collectorMode,
      ...(savedImageName ? { imageName: savedImageName } : {}),
      createdAt: session?.createdAt ?? historyView?.createdAt ?? new Date().toISOString(),
    });
  }, [activities, collectorMode, historyView, onHistorySave, recognitionDraft, result, selectedImage?.name, session?.collectorMode, session?.createdAt, session?.identification, sessionId, status, submittedText]);

  function updateQuery(textarea: HTMLTextAreaElement, setter: (value: string) => void): void {
    const maximumHeight = 75;
    textarea.style.height = "15px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maximumHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maximumHeight ? "auto" : "hidden";
    setter(textarea.value);
  }

  function selectImage(file: File | null): void {
    setError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Only JPG, PNG and WEBP images are supported."); return; }
    if (file.size > 25 * 1024 * 1024) { setError("The image is larger than 25 MB."); return; }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setSelectedImage({ file, name: file.name, url });
    setClarificationRequested(false);
  }

  function clearImage(): void {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setSelectedImage(null);
    for (const input of [cameraInputRef.current, imageInputRef.current, fileInputRef.current]) if (input) input.value = "";
  }

  async function createAnalysis(input: PendingInput): Promise<void> {
    setCreating(true);
    setError(null);
    setClarificationRequested(false);
    setHistoryView(null);
    setSession(null);
    setSessionId(null);
    setSubmittedText(input.text);
    const data = new FormData();
    let uploadFile = input.file;
    if (input.text) data.set("text", input.text);
    if (input.category) data.set("category", input.category);
    data.set("collectorMode", String(input.collectorMode));
    data.set("locale", locale);
    try {
      if (uploadFile) {
        uploadFile = await compressUpload(uploadFile);
        data.set("image", uploadFile);
      }
      const response = await fetch("/api/analysis", { method: "POST", body: data });
      const body = await response.json() as { runId?: string; sessionId?: string; status?: "identified" | "needs_review" | "failed"; identification?: DetectionResult | null; collectorEvidence?: CollectorEvidence | null; toolActivity?: ToolActivity[]; createdAt?: string; error?: string; code?: string; collectorMode?: boolean };
      if (response.status === 422 && body.code === "needs_clarification") {
        setCreating(false);
        setClarificationRequested(true);
        return;
      }
      const runId = body.runId ?? body.sessionId;
      if (!response.ok || !runId || !body.status) throw new Error(body.error ?? "Unable to create analysis.");
      if (uploadFile) await saveRecentImage(runId, uploadFile).catch(() => undefined);
      const now = body.createdAt ?? new Date().toISOString();
      const next: AnalysisSessionView = { id: runId, status: body.status, queuePosition: null, progress: body.status === "identified" ? 32 : 100, message: body.status === "identified" ? "Identification complete. Review the fields before continuing." : body.status === "needs_review" ? "More identification details are needed" : "Identification failed", identification: body.identification ?? null, collectorMode: body.collectorMode ?? input.collectorMode, collectorEvidence: body.collectorEvidence ?? null, toolActivity: body.toolActivity ?? [], createdAt: now, updatedAt: now, result: null, error: body.error ?? null };
      setSessionId(runId);
      setSession(next);
      setRecognitionDraft(next.identification);
      setCreating(false);
    } catch (caught) {
      setCreating(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function submitInput(input: PendingInput): void {
    if (!input.file && !input.text.trim()) return;
    if (!input.file && !isSpecificDescription(input.text)) {
      setClarificationRequested(true);
      return;
    }
    void createAnalysis(input);
  }

  async function continueResearch(): Promise<void> {
    if (!sessionId || !recognitionDraft || status !== "identified" || researchStarting) return;
    setResearchStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/analysis/${encodeURIComponent(sessionId)}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identification: recognitionDraft, collectorMode, collectorEvidence: session?.collectorEvidence ?? null, qwenActivity: activities.find((entry) => entry.provider === "Qwen") ?? null, locale }),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "Unable to start research.");
      }
      onHistoryPromote?.(sessionId);
      setSession((current) => current ? { ...current, status: "queued_research", progress: 36, message: "Research started", queuePosition: null, identification: recognitionDraft } : current);
      if (!response.body) throw new Error("The research stream was unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const progress: Partial<Record<AnalysisStage, number>> = { searching_marketplaces: 45, searching_auctions: 58, searching_fallback: 62, processing_prices: 80, completed: 100, failed: 100 };
      for (;;) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as ResearchStreamEvent;
          if (event.type === "stage") setSession((current) => current ? { ...current, status: event.status, progress: progress[event.status] ?? current.progress, message: event.message, toolActivity: event.toolActivity, updatedAt: new Date().toISOString() } : current);
          if (event.type === "completed") setSession((current) => current ? { ...current, status: "completed", progress: 100, message: "Analysis complete", result: event.result, toolActivity: event.toolActivity, updatedAt: new Date().toISOString(), error: null } : current);
          if (event.type === "error") throw new Error(event.error);
        }
        if (chunk.done) break;
      }
      setResearchStarting(false);
    } catch (caught) {
      setResearchStarting(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function updateRecognized<Key extends keyof DetectionResult>(key: Key, value: DetectionResult[Key]): void {
    setRecognitionDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (key === "category" && value !== "Cards & Game Collectibles") delete next.pokemonCard;
      return next;
    });
  }

  function updatePokemonCard<Key extends keyof PokemonCardIdentity>(key: Key, value: PokemonCardIdentity[Key]): void {
    setRecognitionDraft((current) => {
      if (!current?.pokemonCard) return current;
      const pokemonCard = { ...current.pokemonCard, [key]: value };
      return { ...current, pokemonCard, priceSearchKeywordJa: buildPokemonCardSearchKeyword(pokemonCard) };
    });
  }

  function startSpeech(setter: (value: string) => void): void {
    const root = window as typeof window & { SpeechRecognition?: new () => { lang: string; start(): void; onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void }; webkitSpeechRecognition?: new () => { lang: string; start(): void; onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void } };
    const Constructor = root.SpeechRecognition ?? root.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.onresult = (event) => setter(event.results[0]?.[0]?.transcript ?? "");
    recognition.start();
  }

  function resetToNew(): void {
    setHistoryView(null); setSession(null); setSessionId(null); setRecognitionDraft(null); setSubmittedText(""); setQuery(""); setNextText(""); setNextFile(null); setCollectorMode(false); setError(null); setClarificationRequested(false); clearImage();
  }

  const composerClass = `figma-home-composer${selectedCategory ? " has-selected-category" : ""}${selectedImage ? " has-selected-image" : ""}${clarificationRequested ? " needs-clarification" : ""}${isConversation ? " is-conversation" : ""}${isResearch ? " is-research" : ""}`;

  return <section className={composerClass} aria-labelledby="collectible-heading">
    {!isConversation ? <div className="figma-home-discovery">
      <header className="figma-home-heading"><h1 id="collectible-heading">{copy.heading}</h1><p>{copy.subheading}</p></header>
      <div className={`figma-category-grid flex h-[209px] w-[min(628px,100%)] items-center justify-between gap-[10px] min-[768px]:gap-[normal] [@media(max-width:767px)]:grid [@media(max-width:767px)]:h-auto [@media(max-width:767px)]:w-full [@media(max-width:767px)]:grid-cols-[1fr]${selectedCategory ? " is-hidden" : ""}`}>
        {categories.map((category, categoryIndex) => <button className={`figma-category-card figma-category-card--${category.id}`} type="button" key={category.id} onClick={() => setSelectedCategory(category)} disabled={Boolean(selectedCategory)}>
          <span className="figma-category-visual"><span className="figma-category-image"><img src={category.image} alt="" /></span><span className="figma-category-label">{(copy.categories[categoryIndex] ?? "").split("\n").map((line) => <span key={line}>{line}<br /></span>)}</span></span>
        </button>)}
      </div>
    </div> : null}

    {!isConversation ? <>
      {clarificationRequested ? <div className="figma-clarification-bubble absolute top-[340px] left-1/2 flex min-h-[50px] w-[520px] items-start rounded-[14px] bg-[#f1f1f1] px-[13px] py-[10px] text-[#333] text-[12px] font-normal leading-[1.45] [transform:translateX(-50%)] [font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] animate-[figma-chat-enter_220ms_cubic-bezier(0.22,1,0.36,1)_both] max-[767px]:relative max-[767px]:inset-auto max-[767px]:w-full max-[767px]:min-h-0 max-[767px]:[transform:none]" role="status"><p className="m-0">{copy.clarification}</p></div> : null}
      <form className={`figma-composer-box${selectedImage ? " has-image" : ""}${selectedCategory ? " has-category" : ""}`} onSubmit={(event) => { event.preventDefault(); submitInput({ file: selectedImage?.file ?? null, text: query.trim(), category: selectedCategory?.title ?? null, collectorMode }); }}>
        <div className="figma-composer-content">
          {selectedImage ? <div className="figma-upload-preview relative h-[57px] w-[58px] flex-none overflow-hidden rounded-[11px] border-[0.7px] border-solid border-[#ededed] bg-white"><img className="figma-upload-preview__image block h-full w-full object-cover" src={selectedImage.url} alt={selectedImage.name} /><button className="absolute top-[5px] right-[7px] h-[13px] w-[13px] !cursor-pointer !border-0 !bg-transparent !p-0" type="button" aria-label="Remove uploaded image" onClick={clearImage}><img className="block h-[13px] w-[13px]" src="/figma/upload-preview-remove.svg" alt="" /></button></div> : null}
          {selectedCategory ? <div className="figma-selected-category !flex !w-full !min-h-[15px] !items-center !justify-between !text-black !text-[13px] !font-medium !leading-[15px] !tracking-[-0.26px] ![font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] !animate-[figma-category-enter_220ms_cubic-bezier(0.22,1,0.36,1)_both]"><span>{selectedCategory.title}</span><button className="!grid !h-[18px] !w-[18px] !place-items-center !p-0 !border-0 !rounded-full !bg-transparent !text-[#8a8a8a] !text-[17px] !font-normal !leading-[18px] ![font-family:Arial,sans-serif] !cursor-pointer !transition-[background-color,color] !duration-[140ms] hover:!bg-[#f0f0f0] hover:!text-black focus-visible:!outline-2 focus-visible:!outline-solid focus-visible:!outline-[#111] focus-visible:!outline-offset-[2px]" type="button" aria-label="Remove category" onClick={() => setSelectedCategory(null)}>×</button></div> : null}
          <textarea rows={1} aria-label="Describe collectible" value={query} onInput={(event) => updateQuery(event.currentTarget, setQuery)} onChange={(event) => setQuery(event.target.value)} placeholder={selectedCategory ? "" : copy.placeholder} />
        </div>
        <div className="figma-composer-actions">
          <div className="figma-composer-actions-left">
            <div className="figma-upload-control">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="figma-composer-round-button" type="button" aria-label="Add attachment or mode"><img src="/figma/composer-add.svg" alt="" /></button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-[80] box-border flex min-h-[166px] w-[174px] flex-col items-start justify-between gap-[13px] overflow-hidden rounded-[13px] border border-solid border-[#eeeef1] bg-white px-[13px] py-[12px] shadow-[0_4px_12px_3px_rgba(0,0,0,0.08)] max-[767px]:ml-[-12px] max-[767px]:w-[min(240px,_calc(100vw_-_28px))]"
                    side="top"
                    align="start"
                    sideOffset={10}
                    collisionPadding={8}
                  >
                    <DropdownMenu.Item
                      className="flex h-[13px] w-full flex-none cursor-pointer items-center gap-[12px] rounded-[2px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] whitespace-nowrap"
                      onSelect={() => cameraInputRef.current?.click()}
                    >
                      <img className="block h-[13px] w-[14px] flex-none" src="/figma/upload-menu-camera.svg" alt="" />
                      <span>{copy.takePhoto}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex h-[13px] w-full flex-none cursor-pointer items-center gap-[12px] rounded-[2px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] whitespace-nowrap"
                      onSelect={() => imageInputRef.current?.click()}
                    >
                      <img className="mr-[1px] block h-[11px] w-[13px] flex-none" src="/figma/upload-menu-image.svg" alt="" />
                      <span>{copy.uploadImage}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex h-[13px] w-full flex-none cursor-pointer items-center gap-[18px] rounded-[2px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] tracking-[-0.266px] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] whitespace-nowrap"
                      onSelect={() => fileInputRef.current?.click()}
                    >
                      <img className="block h-[12.291px] w-[7.125px] flex-none" src="/figma/upload-menu-file.svg" alt="" />
                      <span>{copy.uploadFile}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.CheckboxItem
                      className="relative flex h-[24px] w-full flex-none cursor-pointer items-center gap-[12px] rounded-[6px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] hover:bg-[#f3f3f3] data-[state=checked]:bg-[#f3f3f3] data-[highlighted]:bg-[#f3f3f3] whitespace-nowrap"
                      checked={collectorMode}
                      onCheckedChange={(checked) => setCollectorMode(checked === true)}
                    >
                      <span className="w-[14px] flex-none text-center text-[18px] font-semibold leading-[14px] text-[#111] [font-family:Georgia,serif]" aria-hidden="true">✧</span>
                      <span>{copy.collectorMode}</span>
                      <DropdownMenu.ItemIndicator className="absolute right-[5px] text-[11px] text-[#111]" aria-hidden="true">✓</DropdownMenu.ItemIndicator>
                    </DropdownMenu.CheckboxItem>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <input ref={cameraInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
              <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
              <input ref={fileInputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
            </div>
            {collectorMode ? <button className="figma-collector-chip !flex !h-[29px] !items-center !gap-[7px] !rounded-[15px] !border !border-solid !border-[#e3e3e7] !bg-[#f8f8fa] !px-[10px] !text-[#242424] !shadow-[0_1px_2px_rgba(0,0,0,0.02)] !whitespace-nowrap hover:!bg-[#f0f0f2] max-[767px]:!max-w-[190px]" type="button" aria-label="Disable Collector Mode" title="Disable Collector Mode" onClick={() => setCollectorMode(false)}><span className="figma-collector-spark !w-[14px] !flex-none !text-center !text-[#111] !text-[18px] !font-semibold !leading-[14px] ![font-family:Georgia,serif]" aria-hidden="true">✧</span><b className="!text-[11px] !font-semibold max-[767px]:!overflow-hidden max-[767px]:!text-ellipsis">{copy.collectorMode}</b><span className="figma-collector-info !grid !h-[14px] !w-[14px] !place-items-center !rounded-[50%] !border !border-solid !border-[#9a9a9a] !text-[#777] !text-[9px] !font-semibold !leading-[12px] ![font-family:Arial,sans-serif]" aria-hidden="true">i</span></button> : null}
          </div>
          <div className="figma-composer-actions-right">
            {speechSupported ? <button className="figma-composer-microphone" type="button" aria-label="Use microphone" onClick={() => startSpeech(setQuery)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}
            <button className={`figma-composer-round-button figma-composer-submit${submitActive ? " is-active" : ""}`} type="submit" disabled={!submitActive || creating} aria-label="Submit"><img src={submitActive ? "/figma/composer-submit-active.svg" : "/figma/composer-submit.svg"} alt="" /></button>
          </div>
        </div>
      </form>
    </> : <div className="figma-chat-thread" aria-live="polite">
      <div className="figma-chat-user-message">{selectedImage ? <img src={selectedImage.url} alt={selectedImage.name} /> : null}<p>{submittedText || copy.identifyPrompt}</p></div>

      {creating || status === "queued" || status === "identifying" ? <div className={`figma-recognition-card is-analyzing ${recognitionCardClass} ${recognitionAnalyzingCardClass}`}><div className={`figma-recognition-loading-image ${recognitionLoadingImageClass}`} /><div className={`figma-recognition-loading-copy ${recognitionLoadingCopyClass}`}><strong className={recognitionLoadingTitleClass}>{stageMessage(status, locale, session?.message)}</strong><span className={recognitionLoadingDescriptionClass}>{copy.identifyingDetail}</span><i className={recognitionLoadingDotsClass}><b className={recognitionLoadingDotClass} /><b className={recognitionLoadingDotClass} /><b className={recognitionLoadingDotClass} /></i></div></div> : null}

      {(status === "needs_review" || status === "failed") ? <div className="figma-live-error" role="alert"><strong>{stageMessage(status, locale, session?.message)}</strong><p>{errorCopy(session?.error ?? error)}</p><button type="button" onClick={resetToNew}>Start a new analysis</button></div> : null}

      {recognitionDraft && status && !["queued", "identifying", "needs_review", "failed"].includes(status) ? <article className={`figma-recognition-card ${recognitionCardClass}`}>
        <div className={`figma-recognition-main ${recognitionMainClass}`}>{selectedImage ? <img className="figma-recognition-image !h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[#d9d9d9] !object-cover max-[767px]:!h-[112px] max-[767px]:!w-[112px]" src={selectedImage.url} alt={selectedImage.name} /> : <div className="figma-recognition-image-placeholder !h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[#d9d9d9] !object-cover max-[767px]:!h-[112px] max-[767px]:!w-[112px]" />}
          <dl className={`figma-recognition-details ${recognitionDetailsClass}`}>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.itemName}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} ref={itemNameInputRef} aria-label={copy.fields.itemName} disabled={status !== "identified"} value={recognitionDraft.itemName} onChange={(event) => updateRecognized("itemName", event.target.value)} /></dd></div>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.version}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.version} disabled={status !== "identified"} value={recognitionDraft.version} onChange={(event) => updateRecognized("version", event.target.value)} /></dd></div>
            {recognitionDraft.pokemonCard ? <>
              <div className={`figma-pokemon-match-mode ${recognitionDetailRowClass}`}><dt className={recognitionDetailLabelClass}>{copy.fields.matchMode}：</dt><dd className={`${recognitionDetailValueClass} !text-[#286246] !font-semibold`}>{copy.exactPokemonCard}</dd></div>
              <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.cardNumber}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.cardNumber} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.cardNumber} onChange={(event) => updatePokemonCard("cardNumber", event.target.value)} /></dd></div>
              <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.setCode}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.setCode} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.setCode} onChange={(event) => updatePokemonCard("setCode", event.target.value)} /></dd></div>
              <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.rarity}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.rarity} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.rarity} onChange={(event) => updatePokemonCard("rarity", event.target.value)} /></dd></div>
              <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.language}：</dt><dd className={recognitionDetailValueClass}><select className={recognitionSelectClass} aria-label={copy.fields.language} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.language} onChange={(event) => updatePokemonCard("language", event.target.value as PokemonCardIdentity["language"])}><option value="Japanese">{copy.languageValues.Japanese}</option><option value="English">{copy.languageValues.English}</option><option value="unknown">{copy.languageValues.unknown}</option></select></dd></div>
              <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.grading}：</dt><dd className={recognitionDetailValueClass}><select className={recognitionSelectClass} aria-label={copy.fields.grading} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.gradingCompany} onChange={(event) => updatePokemonCard("gradingCompany", event.target.value as PokemonCardIdentity["gradingCompany"])}><option value="ungraded">{copy.gradingValues.ungraded}</option><option value="PSA">PSA</option><option value="BGS">BGS</option><option value="CGC">CGC</option><option value="unknown">{copy.gradingValues.unknown}</option></select></dd></div>
            </> : null}
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.category}：</dt><dd className={recognitionDetailValueClass}><select className={recognitionSelectClass} aria-label={copy.fields.category} disabled={status !== "identified"} value={recognitionDraft.category} onChange={(event) => updateRecognized("category", event.target.value as CollectibleCategory)}>{COLLECTIBLE_CATEGORIES.map((category, index) => <option value={category} key={category}>{(copy.categories[index] ?? category).replace("\n", " ")}</option>)}</select></dd></div>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.priceKeyword}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} lang="ja" aria-label={copy.fields.priceKeyword} disabled={status !== "identified"} value={recognitionDraft.priceSearchKeywordJa} onChange={(event) => updateRecognized("priceSearchKeywordJa", event.target.value)} /></dd></div>
          </dl>
        </div>
        {session?.collectorMode && session.collectorEvidence ? <div className="figma-collector-evidence-preview !my-0 !mr-[16px] !mb-[12px] !ml-[16px] !flex !items-center !justify-between !rounded-[8px] !bg-[#f5f5f5] !px-[12px] !py-[10px] !text-[11px] max-[767px]:!mt-[14px] max-[767px]:!mr-0 max-[767px]:!mb-0 max-[767px]:!ml-0 max-[767px]:!items-start max-[767px]:!gap-[8px] max-[767px]:!flex-col"><b>{copy.collectorEvidence}</b><span className="!text-[#777]">{copy.visibleSignals(session.collectorEvidence.editionSignals.length + session.collectorEvidence.conditionSignals.length + session.collectorEvidence.visibleIdentifiers.length, session.collectorEvidence.missingEvidence.length)}</span></div> : null}
        <div className={`figma-recognition-actions ${recognitionActionsClass}`}><button className="figma-recognition-edit !h-[26px] !w-[60px] !rounded-[8px] !px-[9px] !py-[6px] !flex !items-center !gap-[7px] !border-[0.7px] !border-solid !border-[#d9d9d9] !bg-white !text-black !text-[12px] !font-normal !leading-[normal] !tracking-[-0.24px] !cursor-pointer hover:!opacity-[.72] max-[391px]:!w-auto max-[391px]:!flex-1 max-[391px]:!justify-center" type="button" disabled={status !== "identified" || researchStarting} onClick={() => itemNameInputRef.current?.focus()}><img className="!block !h-[9px] !w-[9px]" src="/figma/toolbar-edit.svg" alt="" /><span>{copy.edit}</span></button><button className="figma-recognition-continue !h-[26px] !w-[118px] !rounded-[8px] !border-0 !border-none !pt-[4px] !pr-[8px] !pb-[6px] !pl-[9px] !bg-black !text-white !text-[12px] !font-normal !leading-[normal] !tracking-[-0.24px] !cursor-pointer hover:!opacity-[.72] disabled:!cursor-default disabled:!opacity-[.45] max-[391px]:!w-auto max-[391px]:!flex-1 max-[391px]:!justify-center" type="button" disabled={status !== "identified" || researchStarting} onClick={() => void continueResearch()}>{researchStarting ? copy.starting : copy.continueResearch}</button></div>
      </article> : null}

      {isResearch && status !== "completed" ? <section className={`figma-agent-process ${researchProgressClass}`}><div className={`figma-agent-process__heading ${researchHeadingClass}`}><span className={`figma-agent-process__spinner ${researchSpinnerClass}`} /><div><strong className={researchHeadingTitleClass}>{stageMessage(status, locale, session?.message)}</strong><p className={researchHeadingDescriptionClass}>{copy.liveSourcesDetail}</p></div></div><ol className={researchStepsClass}>{researchSteps.filter((step) => collectorMode || step !== "searching_auctions").map((step) => {
        const current = stageIndex(status!); const stepPosition = stageIndex(step); const state = current > stepPosition ? "complete" : current === stepPosition ? "active" : "pending";
        return <li className={`${state} ${researchStepClass}`} key={step}><span className={researchStepMarkerClass}>{state === "complete" ? "✓" : ""}</span><p className={researchStepTextClass}>{copy.researchSteps[step]}</p></li>;
      })}</ol></section> : null}

      {status === "completed" && result ? <>
        <section className="figma-agent-answer !flex !w-[720px] !max-w-[calc(100%-68px)] !ml-[34px] !flex-col !gap-[22px] max-[767px]:!w-full max-[767px]:!max-w-none max-[767px]:!ml-0 max-[767px]:!gap-[18px]"><div className={`figma-agent-answer__intro ${resultIntroClass}`}><div><h2 className={resultIntroHeadingClass}>{copy.result.heading}</h2><p className={resultIntroSummaryClass}>{result.priceReference.sampleCount ? copy.result.found(result.priceReference.sampleCount) : copy.result.notEnough}</p></div></div>
          <article className="figma-agent-result-card !overflow-hidden !border !border-solid !border-[#e4e4e4] !rounded-[14px] !bg-white"><header className="!flex !min-h-[70px] !items-center !justify-between !border-b !border-[#ededed] !px-[18px] !py-[14px] max-[767px]:!px-[14px] max-[767px]:!py-[13px]"><div><span className="!text-[#777] !text-[10px] !font-semibold !tracking-[0.08em]">{copy.result.priceReference}</span><h3 className="!mt-[4px] !text-[16px] !font-semibold max-[767px]:![overflow-wrap:anywhere]">{result.identification.itemName}</h3></div><b className="!rounded-[7px] !bg-[#f1f1f1] !px-[8px] !py-[5px] !text-[10px] !tracking-[0.08em]">JPY</b></header><div className="figma-agent-price-range !grid !grid-cols-[repeat(3,1fr)] max-[767px]:!grid-cols-[1fr]"><div className="!flex !min-h-[88px] !flex-col !gap-[7px] !border-r !border-r-solid !border-[#ededed] !px-[18px] !py-[17px] last:!border-r-0 max-[767px]:!min-h-[68px] max-[767px]:!border-r-0 max-[767px]:!border-b-solid max-[767px]:!border-b max-[767px]:!px-[15px] max-[767px]:!py-[13px] last:max-[767px]:!border-b-0"><span className="!text-[#777] !text-[11px]">{copy.result.low}</span><strong className="!text-[23px] !leading-none !font-[550] !tracking-[-0.5px]">{formatYen(result.priceReference.low)}</strong></div><div className="is-median !flex !min-h-[88px] !flex-col !gap-[7px] !border-r !border-r-solid !border-[#ededed] !bg-[#fafafa] !px-[18px] !py-[17px] last:!border-r-0 max-[767px]:!min-h-[68px] max-[767px]:!border-r-0 max-[767px]:!border-b-solid max-[767px]:!border-b max-[767px]:!px-[15px] max-[767px]:!py-[13px] last:max-[767px]:!border-b-0"><span className="!text-[#777] !text-[11px]">{copy.result.typical}</span><strong className="!text-[23px] !leading-none !font-[550] !tracking-[-0.5px]">{formatYen(result.priceReference.median)}</strong></div><div className="!flex !min-h-[88px] !flex-col !gap-[7px] !border-r !border-r-solid !border-[#ededed] !px-[18px] !py-[17px] last:!border-r-0 max-[767px]:!min-h-[68px] max-[767px]:!border-r-0 max-[767px]:!border-b-solid max-[767px]:!border-b max-[767px]:!px-[15px] max-[767px]:!py-[13px] last:max-[767px]:!border-b-0"><span className="!text-[#777] !text-[11px]">{copy.result.high}</span><strong className="!text-[23px] !leading-none !font-[550] !tracking-[-0.5px]">{formatYen(result.priceReference.high)}</strong></div></div><p className="figma-agent-result-note !border-t !border-t-solid !border-[#ededed] !px-[18px] !py-[11px] !text-[#777] !text-[11px]">{copy.result.basedOn(result.priceReference.sampleCount)}</p></article>
          {result.collectorMode && result.collectorEvidence ? <div className="figma-agent-section figma-collector-evidence"><h3>{copy.collectorEvidence}</h3><div className="figma-collector-evidence-grid grid grid-cols-2 gap-[10px] max-[767px]:grid-cols-1"><article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]"><b className="!text-[11px]">{copy.result.editionSignals}</b><ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">{result.collectorEvidence.editionSignals.length ? result.collectorEvidence.editionSignals.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}</ul></article><article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]"><b className="!text-[11px]">{copy.result.visibleCondition}</b><ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">{result.collectorEvidence.conditionSignals.length ? result.collectorEvidence.conditionSignals.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}</ul></article><article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]"><b className="!text-[11px]">{copy.result.visibleIdentifiers}</b><ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">{result.collectorEvidence.visibleIdentifiers.length ? result.collectorEvidence.visibleIdentifiers.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}</ul></article><article className="!rounded-[10px] !border !border-solid !border-[#e5e5e5] !bg-white !p-[13px]"><b className="!text-[11px]">{copy.result.missingEvidence}</b><ul className="!mt-[7px] !mr-0 !mb-0 !ml-0 !list-disc !pl-[16px] !text-[#696969] !text-[10px] !leading-[1.55]">{result.collectorEvidence.missingEvidence.length ? result.collectorEvidence.missingEvidence.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noMissingEvidence}</li>}</ul></article></div></div> : null}
          {result.collectorMode ? <div className="figma-agent-section figma-auction-watch">
            <h3>{copy.result.auctionWatch}</h3>
            <p className="figma-auction-disclaimer !mt-[-3px] !mr-0 !mb-[10px] !ml-0 !text-[#777] !text-[10px]">{copy.result.auctionDisclaimer}</p>
            {result.auctionSources.map((source) => <article className="!mt-[10px] !overflow-hidden !rounded-[11px] !border !border-solid !border-[#e4e4e4] !bg-white" key={source.source}>
              <header className="!flex !items-center !justify-between !border-0 !border-b !border-solid !border-[#ededed] !px-[13px] !py-[11px]">
                <div className="!flex !items-center !gap-[9px]">
                  <b className="!text-[12px]">{source.source === "Yahoo Auctions" ? "Yahoo! Auctions" : source.source}</b>
                  <span className="!text-[#888] !text-[9px]">{copy.result.comparableSignals(source.comparableSignals)}</span>
                </div>
                <small className="!text-[#888] !text-[9px]">{auctionStatus(source.status, locale)}</small>
              </header>
              {source.signals.length ? <div>{source.signals.map((signal) => <a className="!grid !grid-cols-[minmax(0,1fr)_auto] !gap-[16px] !border-t !border-x-0 !border-b-0 !border-solid !border-[#f0f0f0] !px-[13px] !py-[12px] !text-inherit !no-underline first:!border-t-0 max-[767px]:!grid-cols-1" href={signal.url} target="_blank" rel="noreferrer" key={signal.url}>
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
              </a>)}</div> : <p className="figma-auction-empty !m-0 !p-[13px] !text-[#777] !text-[10px]">{copy.result.noAuctionSignals}</p>}
            </article>)}
          </div> : null}
          <div className="figma-agent-section"><h3>{copy.result.whereToLook}</h3><div className="figma-agent-area-grid grid grid-cols-2 gap-[10px] max-[767px]:grid-cols-1">{result.recommendedAreas.map((area) => <article className="min-h-[135px] rounded-[12px] border border-solid border-[#e5e5e5] bg-white p-[15px]" key={area.area}><b className="text-[15px]">{areaName(area.area, locale)}</b><p className="!mt-[6px] !mr-0 !mb-[12px] !ml-0 !text-[#5f5f5f] !text-[12px] !leading-[1.5]">{areaReason(area.area, area.reason, locale)}</p><code className="block overflow-hidden rounded-[6px] bg-[#f5f5f5] px-[8px] py-[7px] !text-[#333] !text-[11px] !font-normal !leading-[1.3] ![font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] text-ellipsis whitespace-nowrap" lang="ja">{area.searchKeywordJa}</code><a className="mt-[10px] inline-block !text-[#333] !text-[11px] !font-[550] [text-underline-offset:3px]" href={mapsUrl(area.searchKeywordJa)} target="_blank" rel="noreferrer">{copy.result.openMaps}</a></article>)}</div></div>
          {result.storeSuggestions.length ? <div className="figma-agent-section"><h3>{copy.result.storeSuggestions}</h3><div className="figma-store-suggestions flex flex-col overflow-hidden rounded-[11px] border border-solid border-[#e5e5e5] bg-white">{result.storeSuggestions.map((store) => <a className="flex flex-col gap-[3px] border-b border-solid border-[#eee] px-[13px] py-[11px] !text-[#222] no-underline last:border-b-0 hover:[&_b]:underline" href={store.sourceUrl} target="_blank" rel="noreferrer" key={`${store.name}-${store.sourceUrl}`}><b>{store.name}</b><span className="!text-[#666] !text-[11px]">{copy.result.storeReason}</span></a>)}</div></div> : null}
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
              {result.priceReference.samples.map((sample) => <a className="!grid !min-h-[39px] !grid-cols-[70px_1fr_auto] !items-center !gap-[12px] !text-[#222] !no-underline max-[767px]:!grid-cols-[36px_minmax(0,1fr)_auto] max-[767px]:!gap-[8px] [@media(max-width:390px)]:[&&]:!grid-cols-[32px_minmax(0,1fr)] [&_span]:!text-[#777] [&_span]:!text-[11px] hover:[&_p]:!underline" href={sample.url} target="_blank" rel="noreferrer" key={`${sample.source}-${sample.url}`}>
                <span className="figma-marketplace-brand !grid !h-[28px] !w-[28px] !place-items-center !overflow-hidden !rounded-[8px] !border !border-solid !border-[#ededed] !bg-white">{sample.source === "Web fallback" ? "W" : <img className="!block !h-[20px] !w-[20px] !object-contain" src={sample.source === "Rakuten" ? "/brands/rakuten.ico" : "/brands/mercari.ico"} alt="" />}<span className="sr-only">{sample.source}</span></span>
                <p className="!overflow-hidden !text-ellipsis !whitespace-nowrap max-[767px]:!text-[11px]">{sample.title}</p>
                <b className="!font-[550] [@media(max-width:390px)]:[&&]:!col-start-2">{formatYen(sample.price)}</b>
              </a>)}
            </div>
          </details>
          <details className="figma-run-details !overflow-hidden !rounded-[11px] !border !border-solid !border-[#e5e5e5] !bg-white">
            <summary className="!flex !items-center !justify-between !cursor-pointer !list-none !px-[14px] !py-[13px] !font-[600] max-[767px]:!items-start max-[767px]:!gap-[8px] [&::-webkit-details-marker]:hidden">
              <span>{copy.result.runDetails}</span>
              <small className="!text-[#888] !text-[10px] !font-[450]">{copy.result.steps(activities.length)} · {activityDuration(result.cost.totalMs)}</small>
            </summary>
            <ol className="!m-0 !list-none !px-[14px] !pt-0 !pb-[13px]">{activities.map((activity) => {
              const activityText = activityCopy(activity, result.identification, result.priceReference.sampleCount, locale);
              const effectiveStatus = result && activity.status === "running" ? "succeeded" : activity.status;
              const markerStatusClass = effectiveStatus === "skipped"
                ? "!border !border-solid !border-[#c9c9c9] !bg-white !text-[#888]"
                : effectiveStatus === "failed" || effectiveStatus === "fallback"
                  ? "!bg-[#777]"
                  : "";
              return <li className={`is-${effectiveStatus} relative grid min-h-[58px] grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-[10px] !border-0 !border-t !border-solid !border-[#eee] px-0 py-[10px] max-[767px]:!grid-cols-[22px_minmax(0,1fr)] [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:top-[34px] [&:not(:last-child)]:after:-bottom-[12px] [&:not(:last-child)]:after:left-[8px] [&:not(:last-child)]:after:w-px [&:not(:last-child)]:after:bg-[#dedede] [&:not(:last-child)]:after:content-['']`} key={activity.provider}>
                <span className={`figma-run-marker relative z-[1] grid h-[17px] w-[17px] place-items-center rounded-full bg-[#111] text-[9px] leading-none text-white ${markerStatusClass}`}>{effectiveStatus === "skipped" ? "—" : effectiveStatus === "failed" || effectiveStatus === "fallback" ? "!" : "✓"}</span>
                <div className="min-w-0"><b className="!block !text-[#222] !text-[12px] !font-[600]">{activityText.title}</b><p className="!mt-[3px] !mr-0 !mb-0 !ml-0 !text-[#707070] !text-[11px] !leading-[1.45]">{activityText.description}</p></div>
                <time className="!pt-[1px] !text-[#999] !text-[10px] !whitespace-nowrap max-[767px]:!col-start-2 max-[767px]:!row-start-2 max-[767px]:!pt-0">{activityDuration(activity.durationMs)}</time>
              </li>;
            })}<li className="is-succeeded is-total relative grid min-h-[58px] grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-[10px] !border-0 !border-t !border-solid !border-[#eee] px-0 !pt-[10px] !pb-[2px] max-[767px]:!grid-cols-[22px_minmax(0,1fr)] [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:top-[34px] [&:not(:last-child)]:after:-bottom-[12px] [&:not(:last-child)]:after:left-[8px] [&:not(:last-child)]:after:w-px [&:not(:last-child)]:after:bg-[#dedede] [&:not(:last-child)]:after:content-['']">
              <span className="figma-run-marker relative z-[1] grid h-[17px] w-[17px] place-items-center rounded-full bg-[#111] text-[9px] leading-none text-white">✓</span>
              <div className="min-w-0"><b className="!block !text-[#222] !text-[12px] !font-[600]">{copy.result.completedRun}</b><p className="!mt-[3px] !mr-0 !mb-0 !ml-0 !text-[#707070] !text-[11px] !leading-[1.45]">{copy.result.completedRunDescription(result.priceReference.sampleCount)}</p></div>
              <time className="!pt-[1px] !text-[#999] !text-[10px] !whitespace-nowrap max-[767px]:!col-start-2 max-[767px]:!row-start-2 max-[767px]:!pt-0">{activityDuration(result.cost.totalMs)}</time>
            </li></ol>
          </details>
        </section>
        <form className="figma-followup-composer" onSubmit={(event) => { event.preventDefault(); const text = nextText.trim(); const file = nextFile; resetToNew(); submitInput({ file, text, category: null, collectorMode: false }); }}><textarea rows={1} value={nextText} onChange={(event) => setNextText(event.target.value)} placeholder={nextFile ? nextFile.name : copy.placeholder} /><div className="figma-followup-actions"><button className="figma-followup-add" type="button" aria-label="Add image" onClick={() => nextFileInputRef.current?.click()}><img src="/figma/composer-add.svg" alt="" /></button><input ref={nextFileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNextFile(event.target.files?.[0] ?? null)} /><div className="figma-followup-actions-right">{speechSupported ? <button className="figma-followup-microphone" type="button" onClick={() => startSpeech(setNextText)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}<button className="figma-followup-submit" type="submit" disabled={!nextText.trim() && !nextFile}><img src="/figma/composer-submit-active.svg" alt="" /></button></div></div></form>
      </> : null}
      {error && status !== "failed" ? <div className="figma-inline-error" role="alert">{error}</div> : null}
    </div>}

  </section>;
}
