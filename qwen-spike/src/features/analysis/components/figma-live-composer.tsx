"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, AnalysisSessionView, AnalysisStage, ToolActivity } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { buildPokemonCardSearchKeyword } from "../../../core/profile/pokemon-card";
import { COLLECTIBLE_CATEGORIES, type CollectibleCategory, type DetectionResult, type PokemonCardIdentity } from "../../../core/profile/types";
import { uiCopy, type UiLocale } from "../locales";
import { loadRecentImage, saveRecentImage } from "../storage/recent-image-store";

const categories = [
  { id: "toys", title: "Toys & Character Collectibles" as CollectibleCategory, label: <>Toys &amp; Character<br />Collectibles</>, image: "/figma/category-toys.png" },
  { id: "games", title: "Cards & Game Collectibles" as CollectibleCategory, label: <>Cards &amp; Game<br />Collectibles</>, image: "/figma/category-games.png" },
  { id: "music", title: "Records & Music Collectibles" as CollectibleCategory, label: <>Records &amp; Music<br />Collectibles</>, image: "/figma/category-music.png" },
] as const;

const researchSteps = ["searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"] as const;

const researchOrder: AnalysisStage[] = ["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"];

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
  accessCode?: string;
  onAccessExpired?: () => void;
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

export function FigmaLiveComposer({ locale = "en", accessCode = "", onAccessExpired, initialHistory = null, onHistorySave, onHistoryPromote, onBusyChange }: Props): React.ReactElement {
  const copy = uiCopy[locale];
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
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
  const uploadMenuRef = useRef<HTMLDivElement>(null);
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
    if (!uploadMenuOpen) return;
    const close = (event: PointerEvent): void => {
      if (!uploadMenuRef.current?.contains(event.target as Node)) setUploadMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [uploadMenuOpen]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(sessionId)}`, { headers: { "X-Demo-Code": accessCode }, cache: "no-store" });
        if (response.status === 401) { onAccessExpired?.(); return; }
        const body = await response.json() as AnalysisSessionView | { error: string };
        if (!response.ok) throw new Error("error" in body ? (body.error ?? "Unable to read analysis status.") : "Unable to read analysis status.");
        if (cancelled) return;
        const next = body as AnalysisSessionView;
        setSession(next);
        setCreating(false);
        if (next.status === "completed") setError(null);
        if (next.status !== "identified") setResearchStarting(false);
        if (next.identification && !["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"].includes(next.status)) {
          setRecognitionDraft(next.identification);
        }
        if (!["identified", "completed", "failed", "needs_review"].includes(next.status)) timer = setTimeout(poll, 1500);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        timer = setTimeout(poll, 2500);
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [accessCode, onAccessExpired, sessionId, session?.status]);

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
    if (file.size > 10 * 1024 * 1024) { setError("The image is larger than 10 MB."); return; }
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
    if (input.file) data.set("image", input.file);
    if (input.text) data.set("text", input.text);
    if (input.category) data.set("category", input.category);
    data.set("collectorMode", String(input.collectorMode));
    data.set("locale", locale);
    try {
      const response = await fetch("/api/analysis", { method: "POST", headers: { "X-Demo-Code": accessCode }, body: data });
      const body = await response.json() as { sessionId?: string; error?: string; code?: string };
      if (response.status === 401) { onAccessExpired?.(); setCreating(false); return; }
      if (response.status === 422 && body.code === "needs_clarification") {
        setCreating(false);
        setClarificationRequested(true);
        return;
      }
      if (!response.ok || !body.sessionId) throw new Error(body.error ?? "Unable to create analysis.");
      if (input.file) await saveRecentImage(body.sessionId, input.file).catch(() => undefined);
      setSessionId(body.sessionId);
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
        headers: { "Content-Type": "application/json", "X-Demo-Code": accessCode },
        body: JSON.stringify({ identification: recognitionDraft }),
      });
      const body = await response.json() as { error?: string; status?: AnalysisStage; queuePosition?: number };
      if (response.status === 401) { onAccessExpired?.(); setResearchStarting(false); return; }
      if (!response.ok) throw new Error(body.error ?? "Unable to start research.");
      onHistoryPromote?.(sessionId);
      setSession((current) => current ? { ...current, status: "queued_research", progress: 36, message: "Research queued", queuePosition: body.queuePosition ?? null, identification: recognitionDraft } : current);
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
      <div className={`figma-category-grid${selectedCategory ? " is-hidden" : ""}`}>
        {categories.map((category, categoryIndex) => <button className={`figma-category-card figma-category-card--${category.id}`} type="button" key={category.id} onClick={() => setSelectedCategory(category)} disabled={Boolean(selectedCategory)}>
          <span className="figma-category-visual"><span className="figma-category-image"><img src={category.image} alt="" /></span><span className="figma-category-label">{(copy.categories[categoryIndex] ?? "").split("\n").map((line) => <span key={line}>{line}<br /></span>)}</span></span>
        </button>)}
      </div>
    </div> : null}

    {!isConversation ? <>
      {clarificationRequested ? <div className="figma-clarification-bubble" role="status"><p>{copy.clarification}</p></div> : null}
      <form className={`figma-composer-box${selectedImage ? " has-image" : ""}${selectedCategory ? " has-category" : ""}`} onSubmit={(event) => { event.preventDefault(); submitInput({ file: selectedImage?.file ?? null, text: query.trim(), category: selectedCategory?.title ?? null, collectorMode }); }}>
        <div className="figma-composer-content">
          {selectedImage ? <div className="figma-upload-preview"><img className="figma-upload-preview__image" src={selectedImage.url} alt={selectedImage.name} /><button type="button" aria-label="Remove uploaded image" onClick={clearImage}><img src="/figma/upload-preview-remove.svg" alt="" /></button></div> : null}
          {selectedCategory ? <div className="figma-selected-category"><span>{selectedCategory.title}</span><button type="button" aria-label="Remove category" onClick={() => setSelectedCategory(null)}>×</button></div> : null}
          <textarea rows={1} aria-label="Describe collectible" value={query} onInput={(event) => updateQuery(event.currentTarget, setQuery)} onChange={(event) => setQuery(event.target.value)} placeholder={selectedCategory ? "" : copy.placeholder} />
        </div>
        <div className="figma-composer-actions">
          <div className="figma-composer-actions-left">
            <div className="figma-upload-control" ref={uploadMenuRef}>
              <button className="figma-composer-round-button" type="button" aria-label="Add attachment or mode" aria-expanded={uploadMenuOpen} onClick={() => setUploadMenuOpen((open) => !open)}><img src="/figma/composer-add.svg" alt="" /></button>
              {uploadMenuOpen ? <div className="figma-upload-menu" role="menu">
                <button type="button" onClick={() => { setUploadMenuOpen(false); cameraInputRef.current?.click(); }}><img className="figma-upload-menu__camera" src="/figma/upload-menu-camera.svg" alt="" /><span>{copy.takePhoto}</span></button>
                <button type="button" onClick={() => { setUploadMenuOpen(false); imageInputRef.current?.click(); }}><img className="figma-upload-menu__image" src="/figma/upload-menu-image.svg" alt="" /><span>{copy.uploadImage}</span></button>
                <button className="figma-upload-menu__file-row" type="button" onClick={() => { setUploadMenuOpen(false); fileInputRef.current?.click(); }}><img className="figma-upload-menu__file" src="/figma/upload-menu-file.svg" alt="" /><span>{copy.uploadFile}</span></button>
                <button className={`figma-upload-menu__collector${collectorMode ? " is-selected" : ""}`} type="button" role="menuitemcheckbox" aria-checked={collectorMode} onClick={() => { setCollectorMode((enabled) => !enabled); setUploadMenuOpen(false); }}><span className="figma-collector-spark" aria-hidden="true">✧</span><span>{copy.collectorMode}</span>{collectorMode ? <span className="figma-upload-menu__check" aria-hidden="true">✓</span> : null}</button>
              </div> : null}
              <input ref={cameraInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
              <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
              <input ref={fileInputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
            </div>
            {collectorMode ? <button className="figma-collector-chip" type="button" aria-label="Disable Collector Mode" title="Disable Collector Mode" onClick={() => setCollectorMode(false)}><span className="figma-collector-spark" aria-hidden="true">✧</span><b>{copy.collectorMode}</b><span className="figma-collector-info" aria-hidden="true">i</span></button> : null}
          </div>
          <div className="figma-composer-actions-right">
            {speechSupported ? <button className="figma-composer-microphone" type="button" aria-label="Use microphone" onClick={() => startSpeech(setQuery)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}
            <button className={`figma-composer-round-button figma-composer-submit${submitActive ? " is-active" : ""}`} type="submit" disabled={!submitActive || creating} aria-label="Submit"><img src={submitActive ? "/figma/composer-submit-active.svg" : "/figma/composer-submit.svg"} alt="" /></button>
          </div>
        </div>
      </form>
    </> : <div className="figma-chat-thread" aria-live="polite">
      <div className="figma-chat-user-message">{selectedImage ? <img src={selectedImage.url} alt={selectedImage.name} /> : null}<p>{submittedText || copy.identifyPrompt}</p></div>

      {creating || status === "queued" || status === "identifying" ? <div className="figma-recognition-card is-analyzing"><div className="figma-recognition-loading-image" /><div className="figma-recognition-loading-copy"><strong>{stageMessage(status, locale, session?.message)}</strong><span>{copy.identifyingDetail}</span><i><b /><b /><b /></i></div></div> : null}

      {(status === "needs_review" || status === "failed") ? <div className="figma-live-error" role="alert"><strong>{stageMessage(status, locale, session?.message)}</strong><p>{errorCopy(session?.error ?? error)}</p><button type="button" onClick={resetToNew}>Start a new analysis</button></div> : null}

      {recognitionDraft && status && !["queued", "identifying", "needs_review", "failed"].includes(status) ? <article className="figma-recognition-card">
        <div className="figma-recognition-main">{selectedImage ? <img className="figma-recognition-image" src={selectedImage.url} alt={selectedImage.name} /> : <div className="figma-recognition-image-placeholder" />}
          <dl className="figma-recognition-details">
            <div><dt>{copy.fields.itemName}：</dt><dd><input ref={itemNameInputRef} aria-label={copy.fields.itemName} disabled={status !== "identified"} value={recognitionDraft.itemName} onChange={(event) => updateRecognized("itemName", event.target.value)} /></dd></div>
            <div><dt>{copy.fields.version}：</dt><dd><input aria-label={copy.fields.version} disabled={status !== "identified"} value={recognitionDraft.version} onChange={(event) => updateRecognized("version", event.target.value)} /></dd></div>
            {recognitionDraft.pokemonCard ? <>
              <div className="figma-pokemon-match-mode"><dt>{copy.fields.matchMode}：</dt><dd>{copy.exactPokemonCard}</dd></div>
              <div><dt>{copy.fields.cardNumber}：</dt><dd><input aria-label={copy.fields.cardNumber} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.cardNumber} onChange={(event) => updatePokemonCard("cardNumber", event.target.value)} /></dd></div>
              <div><dt>{copy.fields.setCode}：</dt><dd><input aria-label={copy.fields.setCode} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.setCode} onChange={(event) => updatePokemonCard("setCode", event.target.value)} /></dd></div>
              <div><dt>{copy.fields.rarity}：</dt><dd><input aria-label={copy.fields.rarity} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.rarity} onChange={(event) => updatePokemonCard("rarity", event.target.value)} /></dd></div>
              <div><dt>{copy.fields.language}：</dt><dd><select aria-label={copy.fields.language} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.language} onChange={(event) => updatePokemonCard("language", event.target.value as PokemonCardIdentity["language"])}><option value="Japanese">{copy.languageValues.Japanese}</option><option value="English">{copy.languageValues.English}</option><option value="unknown">{copy.languageValues.unknown}</option></select></dd></div>
              <div><dt>{copy.fields.grading}：</dt><dd><select aria-label={copy.fields.grading} disabled={status !== "identified"} value={recognitionDraft.pokemonCard.gradingCompany} onChange={(event) => updatePokemonCard("gradingCompany", event.target.value as PokemonCardIdentity["gradingCompany"])}><option value="ungraded">{copy.gradingValues.ungraded}</option><option value="PSA">PSA</option><option value="BGS">BGS</option><option value="CGC">CGC</option><option value="unknown">{copy.gradingValues.unknown}</option></select></dd></div>
            </> : null}
            <div><dt>{copy.fields.category}：</dt><dd><select aria-label={copy.fields.category} disabled={status !== "identified"} value={recognitionDraft.category} onChange={(event) => updateRecognized("category", event.target.value as CollectibleCategory)}>{COLLECTIBLE_CATEGORIES.map((category, index) => <option value={category} key={category}>{(copy.categories[index] ?? category).replace("\n", " ")}</option>)}</select></dd></div>
            <div><dt>{copy.fields.priceKeyword}：</dt><dd><input lang="ja" aria-label={copy.fields.priceKeyword} disabled={status !== "identified"} value={recognitionDraft.priceSearchKeywordJa} onChange={(event) => updateRecognized("priceSearchKeywordJa", event.target.value)} /></dd></div>
          </dl>
        </div>
        {session?.collectorMode && session.collectorEvidence ? <div className="figma-collector-evidence-preview"><b>{copy.collectorEvidence}</b><span>{copy.visibleSignals(session.collectorEvidence.editionSignals.length + session.collectorEvidence.conditionSignals.length + session.collectorEvidence.visibleIdentifiers.length, session.collectorEvidence.missingEvidence.length)}</span></div> : null}
        <div className="figma-recognition-actions"><button className="figma-recognition-edit" type="button" disabled={status !== "identified" || researchStarting} onClick={() => itemNameInputRef.current?.focus()}><img src="/figma/toolbar-edit.svg" alt="" /><span>{copy.edit}</span></button><button className="figma-recognition-continue" type="button" disabled={status !== "identified" || researchStarting} onClick={() => void continueResearch()}>{researchStarting ? copy.starting : copy.continueResearch}</button></div>
      </article> : null}

      {isResearch && status !== "completed" ? <section className="figma-agent-process"><div className="figma-agent-process__heading"><span className="figma-agent-process__spinner" /><div><strong>{stageMessage(status, locale, session?.message)}</strong><p>{copy.liveSourcesDetail}</p></div></div><ol>{researchSteps.filter((step) => collectorMode || step !== "searching_auctions").map((step) => {
        const current = stageIndex(status!); const stepPosition = stageIndex(step); const state = current > stepPosition ? "complete" : current === stepPosition ? "active" : "pending";
        return <li className={state} key={step}><span>{state === "complete" ? "✓" : ""}</span><p>{copy.researchSteps[step]}</p></li>;
      })}</ol></section> : null}

      {status === "completed" && result ? <>
        <section className="figma-agent-answer"><div className="figma-agent-answer__intro"><div><h2>{copy.result.heading}</h2><p>{result.priceReference.sampleCount ? copy.result.found(result.priceReference.sampleCount) : copy.result.notEnough}</p></div></div>
          <article className="figma-agent-result-card"><header><div><span>{copy.result.priceReference}</span><h3>{result.identification.itemName}</h3></div><b>JPY</b></header><div className="figma-agent-price-range"><div><span>{copy.result.low}</span><strong>{formatYen(result.priceReference.low)}</strong></div><div className="is-median"><span>{copy.result.typical}</span><strong>{formatYen(result.priceReference.median)}</strong></div><div><span>{copy.result.high}</span><strong>{formatYen(result.priceReference.high)}</strong></div></div><p className="figma-agent-result-note">{copy.result.basedOn(result.priceReference.sampleCount)}</p></article>
          {result.collectorMode && result.collectorEvidence ? <div className="figma-agent-section figma-collector-evidence"><h3>{copy.collectorEvidence}</h3><div className="figma-collector-evidence-grid"><article><b>{copy.result.editionSignals}</b><ul>{result.collectorEvidence.editionSignals.length ? result.collectorEvidence.editionSignals.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}</ul></article><article><b>{copy.result.visibleCondition}</b><ul>{result.collectorEvidence.conditionSignals.length ? result.collectorEvidence.conditionSignals.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}</ul></article><article><b>{copy.result.visibleIdentifiers}</b><ul>{result.collectorEvidence.visibleIdentifiers.length ? result.collectorEvidence.visibleIdentifiers.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noneVisible}</li>}</ul></article><article><b>{copy.result.missingEvidence}</b><ul>{result.collectorEvidence.missingEvidence.length ? result.collectorEvidence.missingEvidence.map((item) => <li key={item}>{item}</li>) : <li>{copy.result.noMissingEvidence}</li>}</ul></article></div></div> : null}
          {result.collectorMode ? <div className="figma-agent-section figma-auction-watch"><h3>{copy.result.auctionWatch}</h3><p className="figma-auction-disclaimer">{copy.result.auctionDisclaimer}</p>{result.auctionSources.map((source) => <article key={source.source}><header><div><b>{source.source === "Yahoo Auctions" ? "Yahoo! Auctions" : source.source}</b><span>{copy.result.comparableSignals(source.comparableSignals)}</span></div><small>{auctionStatus(source.status, locale)}</small></header>{source.signals.length ? <div>{source.signals.map((signal) => <a href={signal.url} target="_blank" rel="noreferrer" key={signal.url}><div><b>{signal.title}</b><span>{signal.bidCount === null ? copy.result.bidsUnknown : copy.result.bids(signal.bidCount)} · {signal.remainingTime}</span>{signal.unresolvedDifferences.length ? <small>{signal.unresolvedDifferences.join(" · ")}</small> : null}</div><dl><div><dt>{copy.result.current}</dt><dd>{formatYen(signal.currentPrice)}</dd></div>{signal.startingPrice !== null ? <div><dt>{copy.result.starting}</dt><dd>{formatYen(signal.startingPrice)}</dd></div> : null}{signal.buyNowPrice !== null ? <div><dt>{copy.result.buyNow}</dt><dd>{formatYen(signal.buyNowPrice)}</dd></div> : null}</dl></a>)}</div> : <p className="figma-auction-empty">{copy.result.noAuctionSignals}</p>}</article>)}</div> : null}
          <div className="figma-agent-section"><h3>{copy.result.whereToLook}</h3><div className="figma-agent-area-grid">{result.recommendedAreas.map((area) => <article key={area.area}><b>{areaName(area.area, locale)}</b><p>{areaReason(area.area, area.reason, locale)}</p><code lang="ja">{area.searchKeywordJa}</code><a className="figma-area-map-link" href={mapsUrl(area.searchKeywordJa)} target="_blank" rel="noreferrer">{copy.result.openMaps}</a></article>)}</div></div>
          {result.storeSuggestions.length ? <div className="figma-agent-section"><h3>{copy.result.storeSuggestions}</h3><div className="figma-store-suggestions">{result.storeSuggestions.map((store) => <a href={store.sourceUrl} target="_blank" rel="noreferrer" key={`${store.name}-${store.sourceUrl}`}><b>{store.name}</b><span>{copy.result.storeReason}</span></a>)}</div></div> : null}
          <details className="figma-agent-sources"><summary><span>{copy.result.viewSources}</span><span className="figma-source-brand-stack" aria-hidden="true"><span><img src="/brands/rakuten.ico" alt="" /></span><span><img src="/brands/mercari.ico" alt="" /></span></span></summary><div>{result.priceReference.samples.map((sample) => <a href={sample.url} target="_blank" rel="noreferrer" key={`${sample.source}-${sample.url}`}><span className="figma-marketplace-brand">{sample.source === "Web fallback" ? "W" : <img src={sample.source === "Rakuten" ? "/brands/rakuten.ico" : "/brands/mercari.ico"} alt="" />}<span className="sr-only">{sample.source}</span></span><p>{sample.title}</p><b>{formatYen(sample.price)}</b></a>)}</div></details>
          <details className="figma-run-details"><summary><span>{copy.result.runDetails}</span><small>{copy.result.steps(activities.length)} · {activityDuration(result.cost.totalMs)}</small></summary><ol>{activities.map((activity) => {
            const activityText = activityCopy(activity, result.identification, result.priceReference.sampleCount, locale);
            const effectiveStatus = result && activity.status === "running" ? "succeeded" : activity.status;
            return <li className={`is-${effectiveStatus}`} key={activity.provider}><span className="figma-run-marker">{effectiveStatus === "skipped" ? "—" : effectiveStatus === "failed" || effectiveStatus === "fallback" ? "!" : "✓"}</span><div><b>{activityText.title}</b><p>{activityText.description}</p></div><time>{activityDuration(activity.durationMs)}</time></li>;
          })}<li className="is-succeeded is-total"><span className="figma-run-marker">✓</span><div><b>{copy.result.completedRun}</b><p>{copy.result.completedRunDescription(result.priceReference.sampleCount)}</p></div><time>{activityDuration(result.cost.totalMs)}</time></li></ol></details>
        </section>
        <form className="figma-followup-composer" onSubmit={(event) => { event.preventDefault(); const text = nextText.trim(); const file = nextFile; resetToNew(); submitInput({ file, text, category: null, collectorMode: false }); }}><textarea rows={1} value={nextText} onChange={(event) => setNextText(event.target.value)} placeholder={nextFile ? nextFile.name : copy.placeholder} /><div className="figma-followup-actions"><button className="figma-followup-add" type="button" aria-label="Add image" onClick={() => nextFileInputRef.current?.click()}><img src="/figma/composer-add.svg" alt="" /></button><input ref={nextFileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNextFile(event.target.files?.[0] ?? null)} /><div className="figma-followup-actions-right">{speechSupported ? <button className="figma-followup-microphone" type="button" onClick={() => startSpeech(setNextText)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}<button className="figma-followup-submit" type="submit" disabled={!nextText.trim() && !nextFile}><img src="/figma/composer-submit-active.svg" alt="" /></button></div></div></form>
      </> : null}
      {error && status !== "failed" ? <div className="figma-inline-error" role="alert">{error}</div> : null}
    </div>}

  </section>;
}
