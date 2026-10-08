"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, AnalysisSessionView, AnalysisStage, ResearchStreamEvent, ToolActivity } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { buildPokemonCardSearchKeyword } from "../../../core/profile/pokemon-card";
import { type CollectibleCategory, type DetectionResult, type PokemonCardIdentity } from "../../../core/profile/types";
import { uiCopy, type UiLocale } from "../locales";
import { loadRecentImage, saveRecentImage } from "../storage/recent-image-store";
import { compressUpload } from "../lib/compress-upload";
import { recognizeCollectible } from "../services/recognition-service";
import { startResearch } from "../services/research-service";
import { InputStage, type PendingInput } from "./input-stage";
import { RecognitionStage } from "./recognition-stage";
import { ResearchStage } from "./research-stage";
import { ResultStage } from "./result-stage";

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

export function AnalysisRun({ locale = "en", initialHistory = null, onHistorySave, onHistoryPromote, onBusyChange }: Props): React.ReactElement {
  const copy = uiCopy[locale];
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CollectibleCategory | null>(null);
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
      const response = await recognizeCollectible(data);
      const body = response.body;
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
      const response = await startResearch({
        sessionId,
        identification: recognitionDraft,
        collectorMode,
        collectorEvidence: session?.collectorEvidence ?? null,
        qwenActivity: activities.find((entry) => entry.provider === "Qwen") ?? null,
        locale,
      });
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
    {!isConversation ? <>
      <InputStage
        locale={locale}
        query={query}
        selectedCategory={selectedCategory}
        selectedImage={selectedImage}
        collectorMode={collectorMode}
        clarificationRequested={clarificationRequested}
        creating={creating}
        submitActive={submitActive}
        speechSupported={speechSupported}
        onQueryChange={setQuery}
        onCategoryChange={setSelectedCategory}
        onImageSelect={selectImage}
        onImageClear={clearImage}
        onCollectorModeChange={setCollectorMode}
        onSpeechInput={() => startSpeech(setQuery)}
        onSubmit={submitInput}
      />
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
