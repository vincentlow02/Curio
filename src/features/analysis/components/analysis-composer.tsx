"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, AnalysisSessionView, AnalysisStage, CollectorEvidence, ResearchStreamEvent, ToolActivity } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { buildPokemonCardSearchKeyword } from "../../../core/profile/pokemon-card";
import { type CollectibleCategory, type DetectionResult, type PokemonCardIdentity } from "../../../core/profile/types";
import { uiCopy, type UiLocale } from "../locales";
import { loadRecentImage, saveRecentImage } from "../storage/recent-image-store";
import { compressUpload } from "../lib/compress-upload";
import { RecognitionStage } from "./recognition-stage";
import { ResearchStage } from "./research-stage";
import { ResultStage } from "./result-stage";

const categories = [
  { id: "toys", title: "Toys & Character Collectibles" as CollectibleCategory, label: <>Toys &amp; Character<br />Collectibles</>, image: "/figma/category-toys.png" },
  { id: "games", title: "Cards & Game Collectibles" as CollectibleCategory, label: <>Cards &amp; Game<br />Collectibles</>, image: "/figma/category-games.png" },
  { id: "music", title: "Records & Music Collectibles" as CollectibleCategory, label: <>Records &amp; Music<br />Collectibles</>, image: "/figma/category-music.png" },
] as const;

const recognitionAnalyzingCardClass = "!flex !flex-row !items-center !gap-[28px] max-[767px]:!flex-col max-[767px]:!items-start max-[767px]:!gap-[18px]";
const recognitionLoadingImageClass = "!h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[linear-gradient(100deg,#e3e3e3_20%,#f3f3f3_40%,#e3e3e3_60%)] ![background-size:220%_100%] max-[767px]:!h-[112px] max-[767px]:!w-[112px]";
const recognitionLoadingCopyClass = "!flex !flex-col !items-start !gap-[10px] !text-black";
const recognitionLoadingTitleClass = "!text-[15px] !font-medium";
const recognitionLoadingDescriptionClass = "!text-[12px] !text-[#777] max-[767px]:!leading-[1.45]";
const recognitionLoadingDotsClass = "!mt-[3px] !flex !gap-[4px]";
const recognitionLoadingDotClass = "!h-[5px] !w-[5px] !rounded-full !bg-[#111]";
const recognitionCardClass = "!relative !w-full !min-h-[202px] !overflow-hidden !border !border-solid !border-[#e6e6e6] !rounded-[14px] !bg-white !p-[15px_21px] !text-black animate-[figma-chat-enter_260ms_cubic-bezier(0.22,1,0.36,1)_both] max-[767px]:!min-h-0 max-[767px]:!overflow-visible max-[767px]:!p-[14px]";
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

function stageMessage(status: AnalysisStage | null, locale: UiLocale, fallback?: string): string {
  const messages = uiCopy[locale].stages;
  return (status && messages[status]) || fallback || messages.starting;
}

function errorCopy(message: string | null | undefined): string {
  if (!message) return "The analysis could not continue.";
  if (/无法可靠判断收藏品类别/.test(message)) return "The collectible category could not be identified reliably. Try a clearer image or add the brand and model.";
  if (/任务不存在|已经过期/.test(message)) return "The analysis session does not exist or has expired.";
  if (/分析服务暂时不可用/.test(message)) return "The analysis service is temporarily unavailable. Please try again.";
  return message;
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

      {recognitionDraft && status && !["queued", "identifying", "needs_review", "failed"].includes(status) ? (
        <RecognitionStage
          recognition={recognitionDraft}
          status={status}
          image={selectedImage}
          collectorEvidence={session?.collectorMode ? session.collectorEvidence : null}
          researchStarting={researchStarting}
          locale={locale}
          cardClass={recognitionCardClass}
          onUpdateRecognized={updateRecognized}
          onUpdatePokemonCard={updatePokemonCard}
          onContinueResearch={() => void continueResearch()}
        />
      ) : null}

      {isResearch && status !== "completed" ? (
        <ResearchStage status={status} message={stageMessage(status, locale, session?.message)} locale={locale} collectorMode={collectorMode} />
      ) : null}

      {status === "completed" && result ? <>
        <ResultStage result={result} activities={activities} locale={locale} />
        <form className="figma-followup-composer" onSubmit={(event) => { event.preventDefault(); const text = nextText.trim(); const file = nextFile; resetToNew(); submitInput({ file, text, category: null, collectorMode: false }); }}><textarea rows={1} value={nextText} onChange={(event) => setNextText(event.target.value)} placeholder={nextFile ? nextFile.name : copy.placeholder} /><div className="figma-followup-actions"><button className="figma-followup-add" type="button" aria-label="Add image" onClick={() => nextFileInputRef.current?.click()}><img src="/figma/composer-add.svg" alt="" /></button><input ref={nextFileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNextFile(event.target.files?.[0] ?? null)} /><div className="figma-followup-actions-right">{speechSupported ? <button className="figma-followup-microphone" type="button" onClick={() => startSpeech(setNextText)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}<button className="figma-followup-submit" type="submit" disabled={!nextText.trim() && !nextFile}><img src="/figma/composer-submit-active.svg" alt="" /></button></div></div></form>
      </> : null}
      {error && status !== "failed" ? <div className="figma-inline-error" role="alert">{error}</div> : null}
    </div>}

  </section>;
}
