"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisSessionView, AnalysisStage } from "../../../core/analysis/types";
import type { CollectibleCategory } from "../../../core/profile/types";
import { uiCopy, type UiLocale } from "../locales";
import { loadAnalysisImage } from "../services/history-service";
import { InputStage } from "./input-stage";
import { RecognitionStage } from "./recognition-stage";
import { ResearchStage } from "./research-stage";
import { ResultStage } from "./result-stage";
import { useAnalysisRun } from "../hooks/use-analysis-run";
import type { RecentAnalysisRecord } from "../types";
export type { RecentAnalysisRecord } from "../types";

const recognitionAnalyzingCardClass = "!flex !flex-row !items-center !gap-[28px] max-[767px]:!flex-col max-[767px]:!items-start max-[767px]:!gap-[18px]";
const recognitionLoadingImageClass = "!h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[linear-gradient(100deg,#e3e3e3_20%,#f3f3f3_40%,#e3e3e3_60%)] ![background-size:220%_100%] max-[767px]:!h-[112px] max-[767px]:!w-[112px]";
const recognitionLoadingCopyClass = "!flex !flex-col !items-start !gap-[10px] !text-black";
const recognitionLoadingTitleClass = "!text-[15px] !font-medium";
const recognitionLoadingDescriptionClass = "!text-[12px] !text-[#777] max-[767px]:!leading-[1.45]";
const recognitionLoadingDotsClass = "!mt-[3px] !flex !gap-[4px]";
const recognitionLoadingDotClass = "!h-[5px] !w-[5px] !rounded-full !bg-[#111]";
const recognitionCardClass = "!relative !w-full !min-h-[202px] !overflow-hidden !border !border-solid !border-[#e6e6e6] !rounded-[14px] !bg-white !p-[15px_21px] !text-black animate-[figma-chat-enter_260ms_cubic-bezier(0.22,1,0.36,1)_both] max-[767px]:!min-h-0 max-[767px]:!overflow-visible max-[767px]:!p-[14px]";
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
  const analysis = useAnalysisRun({ locale, initialHistory, onHistoryPromote });
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CollectibleCategory | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [nextText, setNextText] = useState("");
  const [nextFile, setNextFile] = useState<File | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const nextFileInputRef = useRef<HTMLInputElement>(null);
  const {
    activities,
    clarificationRequested,
    collectorMode,
    creating,
    error,
    historyView,
    isBusy,
    isConversation,
    isResearch,
    recognitionDraft,
    researchStarting,
    result,
    session,
    sessionId,
    phase,
    showInlineError,
    status,
    submittedText,
    confirmRecognition,
    resetAnalysis,
    setClarificationRequested,
    setCollectorMode,
    setError,
    submitInput,
    updatePokemonCard,
    updateRecognition,
  } = analysis;
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
    void loadAnalysisImage(initialHistory.id).then((file) => {
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
    resetAnalysis();
    setQuery("");
    setSelectedCategory(null);
    setNextText("");
    setNextFile(null);
    clearImage();
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

      {phase === "error" && isConversation ? <div className="figma-live-error" role="alert"><strong>{stageMessage(status === "needs_review" || status === "failed" ? status : "failed", locale, session?.message)}</strong><p>{errorCopy(session?.error ?? error)}</p><button type="button" onClick={resetToNew}>Start a new analysis</button></div> : null}

      {recognitionDraft && status && ["confirmation", "research-starting", "researching", "completed"].includes(phase) ? (
        <RecognitionStage
          recognition={recognitionDraft}
          status={status}
          image={selectedImage}
          collectorEvidence={session?.collectorMode ? session.collectorEvidence : null}
          researchStarting={researchStarting}
          locale={locale}
          cardClass={recognitionCardClass}
          onUpdateRecognized={updateRecognition}
          onUpdatePokemonCard={updatePokemonCard}
          onContinueResearch={() => void confirmRecognition()}
        />
      ) : null}

      {phase === "researching" && status && status !== "completed" ? (
        <ResearchStage status={status} message={stageMessage(status, locale, session?.message)} locale={locale} collectorMode={collectorMode} />
      ) : null}

      {phase === "completed" && result ? <>
        <ResultStage result={result} activities={activities} locale={locale} />
        <form className="figma-followup-composer" onSubmit={(event) => { event.preventDefault(); const text = nextText.trim(); const file = nextFile; resetToNew(); submitInput({ file, text, category: null, collectorMode: false }); }}><textarea rows={1} value={nextText} onChange={(event) => setNextText(event.target.value)} placeholder={nextFile ? nextFile.name : copy.placeholder} /><div className="figma-followup-actions"><button className="figma-followup-add" type="button" aria-label="Add image" onClick={() => nextFileInputRef.current?.click()}><img src="/figma/composer-add.svg" alt="" /></button><input ref={nextFileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNextFile(event.target.files?.[0] ?? null)} /><div className="figma-followup-actions-right">{speechSupported ? <button className="figma-followup-microphone" type="button" onClick={() => startSpeech(setNextText)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}<button className="figma-followup-submit" type="submit" disabled={!nextText.trim() && !nextFile}><img src="/figma/composer-submit-active.svg" alt="" /></button></div></div></form>
      </> : null}
    </div>}
    {showInlineError ? <div className="figma-inline-error" role="alert">{error}</div> : null}

  </section>;
}
