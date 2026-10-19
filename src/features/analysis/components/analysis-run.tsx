"use client";

import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { ArrowUp, Mic, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui/icon";
import type { AnalysisStage } from "../../../core/analysis/types";
import type { CollectibleCategory } from "../../../core/profile/types";
import { uiCopy, type UiLocale } from "../locales";
import { loadAnalysisImage } from "../services/history-service";
import { answerFollowup } from "../services/followup-service";
import { getConversationImageUrl } from "../services/conversation-service";
import { InputStage } from "./input-stage";
import { RecognitionStage } from "./recognition-stage";
import { ResearchStage } from "./research-stage";
import { ResultStage } from "./result-stage";
import { useAnalysisRun } from "../hooks/use-analysis-run";
import type { AnalysisFollowup, ConversationRecord, ConversationMessage, RecentAnalysisRecord } from "../types";
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
  initialConversation?: ConversationRecord | null;
  onHistorySave?: (record: RecentAnalysisRecord) => void;
  onBusyChange?: (busy: boolean) => void;
};

type SelectedImage = { file: File; name: string; url: string };

const speechLocales: Record<UiLocale, string> = { en: "en-US", zh: "zh-CN", ja: "ja-JP" };

const cjkPattern = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;
const leadingPunctuationPattern = /^[,.!?;:、。，．！？：；]/;

function joinTranscript(existing: string, addition: string): string {
  if (!existing) return addition;
  if (!addition) return existing;
  const left = existing.slice(-1);
  const right = addition.slice(0, 1);
  const needsSpace = !/\s/.test(left) && !/\s/.test(right) && !leadingPunctuationPattern.test(right) && !cjkPattern.test(left) && !cjkPattern.test(right);
  return needsSpace ? `${existing} ${addition}` : existing + addition;
}

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

export function AnalysisRun({ locale = "en", initialHistory = null, initialConversation = null, onHistorySave, onBusyChange }: Props): React.ReactElement {
  const copy = uiCopy[locale];
  const analysis = useAnalysisRun({ locale, initialHistory });
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CollectibleCategory | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [nextText, setNextText] = useState("");
  const [nextFile, setNextFile] = useState<File | null>(null);
  const [followups, setFollowups] = useState<AnalysisFollowup[]>(initialHistory?.followups ?? []);
  const [followupPending, setFollowupPending] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const historyRecordRef = useRef<RecentAnalysisRecord | null>(initialHistory);
  const previewUrlRef = useRef<string | null>(null);
  const nextFileInputRef = useRef<HTMLInputElement>(null);
  const {
    interimTranscript,
    finalTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();
  const speechSupported = browserSupportsSpeechRecognition;
  const consumedFinalRef = useRef(0);
  const speechTargetRef = useRef<"main" | "followup">("main");
  const listeningRef = useRef(false);
  listeningRef.current = listening;
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
  const currentFollowupIds = new Set((initialHistory?.followups ?? followups).flatMap((followup) => [followup.userMessageId, followup.assistantMessageId]));
  const currentMessageIds = new Set([
    ...(initialHistory?.id ? [initialHistory.id] : []),
    ...(initialHistory?.userMessageId ? [initialHistory.userMessageId] : []),
    ...currentFollowupIds,
  ]);
  const priorMessages = (initialConversation?.messages ?? []).filter((message) => !currentMessageIds.has(message.id));

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // Submitting the main composer moves into the conversation view and unmounts
  // that mic button; flush its dictation. The followup composer keeps its own mic.
  useEffect(() => {
    if (isConversation && listening && speechTargetRef.current === "main") void SpeechRecognition.stopListening();
  }, [isConversation, listening]);

  // Consume each finalized dictation chunk exactly once: finalTranscript keeps
  // accumulating for the whole session, so track how much has been appended.
  useEffect(() => {
    if (!finalTranscript) {
      consumedFinalRef.current = 0;
      return;
    }
    const addition = finalTranscript.slice(consumedFinalRef.current);
    if (!addition) return;
    consumedFinalRef.current = finalTranscript.length;
    const append = speechTargetRef.current === "followup" ? setNextText : setQuery;
    append((previous) => joinTranscript(previous, addition));
  }, [finalTranscript]);

  // react-speech-recognition only maps "not-allowed" internally; surface the
  // remaining recognition errors with the raw recognition's error event, and
  // abort on recoverable ones so continuous mode does not restart into them.
  useEffect(() => {
    const recognition = SpeechRecognition.getRecognition();
    if (!recognition) return;
    const handleError = (event: SpeechRecognitionErrorEvent): void => {
      // "not-allowed" is handled (and disabled) by the library itself.
      if (event.error === "not-allowed") setError(copy.speechPermission);
      else if (event.error === "service-not-allowed") {
        void SpeechRecognition.abortListening();
        setError(copy.speechPermission);
      } else if (event.error === "audio-capture") {
        void SpeechRecognition.abortListening();
        setError(copy.speechNoMic);
      } else if (event.error === "network") {
        void SpeechRecognition.abortListening();
        setError(copy.speechNetwork);
      }
    };
    recognition.addEventListener("error", handleError);
    return () => recognition.removeEventListener("error", handleError);
  }, [copy, setError]);

  useEffect(() => () => {
    if (listeningRef.current) void SpeechRecognition.abortListening();
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    setFollowups(initialHistory?.followups ?? []);
    historyRecordRef.current = initialHistory;
    setFollowupError(null);
  }, [initialHistory?.id, initialHistory?.followups]);

  useEffect(() => {
    if (!initialHistory?.id || !initialHistory.imageName) return;
    let cancelled = false;
    const loadImage = async (): Promise<File | null> => {
      const localImage = await loadAnalysisImage(initialHistory.id);
      if (localImage || !initialHistory.conversationImagePath || !initialConversation) return localImage;
      const signedUrl = await getConversationImageUrl(initialConversation.id, initialHistory.conversationImagePath);
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error("The saved image could not be loaded.");
      const blob = await response.blob();
      return new File([blob], initialHistory.imageName!, { type: blob.type || "image/jpeg" });
    };
    void loadImage().then((file) => {
      if (cancelled || !file) return;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setSelectedImage({ file, name: file.name, url });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [initialConversation?.id, initialHistory?.conversationImagePath, initialHistory?.id, initialHistory?.imageName]);

  useEffect(() => {
    if (!onHistorySave || !status) return;
    const id = sessionId ?? historyView?.id;
    if (!id) return;
    const savedRecognition = result?.identification ?? recognitionDraft ?? session?.identification ?? historyView?.recognition ?? null;
    const savedImageName = selectedImage?.name ?? historyView?.imageName;
    const savedRecord: RecentAnalysisRecord = {
      id,
      ...(initialHistory?.userMessageId ? { userMessageId: initialHistory.userMessageId } : {}),
      ...(initialHistory?.conversationImagePath ? { conversationImagePath: initialHistory.conversationImagePath } : {}),
      ...(followups.length ? { followups } : {}),
      ...(session?.recognitionSnapshot || historyView?.recognitionSnapshot
        ? { recognitionSnapshot: (session?.recognitionSnapshot ?? historyView?.recognitionSnapshot)! }
        : {}),
      title: savedRecognition?.itemName || submittedText || "Analyzing collectible…",
      submittedText,
      recognition: savedRecognition,
      result,
      toolActivity: activities,
      status,
      collectorMode: session?.collectorMode ?? collectorMode,
      ...(savedImageName ? { imageName: savedImageName } : {}),
      createdAt: session?.createdAt ?? historyView?.createdAt ?? new Date().toISOString(),
    };
    historyRecordRef.current = savedRecord;
    onHistorySave(savedRecord);
  }, [activities, collectorMode, followups, historyView, initialHistory?.conversationImagePath, initialHistory?.userMessageId, onHistorySave, recognitionDraft, result, selectedImage?.name, session?.collectorMode, session?.createdAt, session?.identification, session?.recognitionSnapshot, sessionId, status, submittedText]);

  async function submitFollowup(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const question = nextText.trim();
    if (!question || followupPending) return;
    if (nextFile) {
      const file = nextFile;
      setNextText("");
      setNextFile(null);
      resetAnalysis();
      submitInput({ file, text: question, category: null, collectorMode: false });
      return;
    }
    const record = historyRecordRef.current;
    if (!record?.result) {
      setFollowupError("Complete an analysis before asking a follow-up question.");
      return;
    }
    setFollowupPending(true);
    setFollowupError(null);
    try {
      const answer = await answerFollowup(question, record.result, locale, followups);
      const createdAt = new Date().toISOString();
      const next: AnalysisFollowup[] = [
        ...followups,
        { userMessageId: crypto.randomUUID(), assistantMessageId: crypto.randomUUID(), question, answer, createdAt },
      ];
      setFollowups(next);
      setNextText("");
      const updatedRecord = { ...record, followups: next };
      historyRecordRef.current = updatedRecord;
      onHistorySave?.(updatedRecord);
    } catch (error) {
      setFollowupError(error instanceof Error ? error.message : "The follow-up could not be answered.");
    } finally {
      setFollowupPending(false);
    }
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
  }

  function toggleSpeech(target: "main" | "followup"): void {
    if (listening) {
      void SpeechRecognition.stopListening();
      return;
    }
    if (!browserSupportsSpeechRecognition) {
      setError(copy.speechUnsupported);
      return;
    }
    setError(null);
    speechTargetRef.current = target;
    resetTranscript();
    consumedFinalRef.current = 0;
    void SpeechRecognition.startListening({ continuous: true, language: speechLocales[locale] });
  }

  function resetToNew(): void {
    // Abort (not stop) so a pending interim chunk is discarded instead of
    // being finalized into the freshly cleared composer.
    if (listeningRef.current) void SpeechRecognition.abortListening();
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
        speechListening={listening && speechTargetRef.current === "main"}
        interimTranscript={interimTranscript}
        onQueryChange={setQuery}
        onCategoryChange={setSelectedCategory}
        onImageSelect={selectImage}
        onImageClear={clearImage}
        onCollectorModeChange={setCollectorMode}
        onSpeechToggle={() => toggleSpeech("main")}
        onSubmit={submitInput}
      />
    </> : <div className="figma-chat-thread" aria-live="polite">
      {priorMessages.map((message) => renderConversationMessage(message, locale))}
      <div className="figma-chat-user-message">{selectedImage ? <img src={selectedImage.url} alt={selectedImage.name} /> : null}<p>{submittedText || copy.identifyPrompt}</p></div>

      {creating || status === "queued" || status === "identifying" ? <div className={`figma-recognition-card is-analyzing ${recognitionCardClass} ${recognitionAnalyzingCardClass}`}><div className={`figma-recognition-loading-image ${recognitionLoadingImageClass}`} /><div className={`figma-recognition-loading-copy ${recognitionLoadingCopyClass}`}><strong className={recognitionLoadingTitleClass}>{stageMessage(status, locale, session?.message)}</strong><span className={recognitionLoadingDescriptionClass}>{copy.identifyingDetail}</span><i className={recognitionLoadingDotsClass}><b className={recognitionLoadingDotClass} /><b className={recognitionLoadingDotClass} /><b className={recognitionLoadingDotClass} /></i></div></div> : null}

      {phase === "error" && isConversation ? <div className="figma-live-error" role="alert"><strong>{stageMessage(status === "needs_review" || status === "failed" ? status : "failed", locale, session?.message)}</strong><p>{errorCopy(session?.error ?? error)}</p><button type="button" onClick={resetToNew}>Start a new analysis</button></div> : null}

      {recognitionDraft && status && ["confirmation", "research-starting", "researching", "completed"].includes(phase) ? (
        <RecognitionStage
          key={sessionId ?? historyView?.id}
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
        {followups.map((followup) => <div className="figma-followup-pair" key={followup.userMessageId}>
          <div className="figma-chat-user-message"><p>{followup.question}</p></div>
          <p className="figma-followup-answer">{followup.answer}</p>
        </div>)}
        {followupPending ? <p className="figma-followup-answer" role="status">{locale === "zh" ? "正在整理回答…" : locale === "ja" ? "回答を準備しています…" : "Preparing an answer…"}</p> : null}
        {followupError ? <p className="figma-followup-error" role="alert">{followupError}</p> : null}
        <form className="figma-followup-composer" onSubmit={(event) => { void submitFollowup(event); }}>
          <textarea rows={1} value={nextText} onChange={(event) => setNextText(event.target.value)} placeholder={nextFile ? nextFile.name : copy.placeholder} disabled={followupPending} />
          <div className="figma-followup-actions">
            <button className="figma-followup-add" type="button" aria-label="Add image" onClick={() => nextFileInputRef.current?.click()} disabled={followupPending}><Icon icon={Plus} /></button>
            <input ref={nextFileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNextFile(event.target.files?.[0] ?? null)} />
            <div className="figma-followup-actions-right">
              {speechSupported ? <button className={`figma-followup-microphone${listening && speechTargetRef.current === "followup" ? " is-listening" : ""}`} type="button" aria-label={listening && speechTargetRef.current === "followup" ? copy.stopVoiceInput : copy.voiceInput} onClick={() => toggleSpeech("followup")} disabled={followupPending}><Icon icon={Mic} size={16} /></button> : <span />}
              <button className="figma-followup-submit" type="submit" aria-label="Send message" disabled={followupPending || (!nextText.trim() && !nextFile)}><Icon icon={ArrowUp} size={18} /></button>
            </div>
          </div>
        </form>
      </> : null}
    </div>}
    {showInlineError ? <div className="figma-inline-error" role="alert">{error}</div> : null}

  </section>;
}

function renderConversationMessage(message: ConversationMessage, locale: UiLocale): React.ReactElement {
  if (message.role === "user") {
    return <div className="figma-chat-user-message" key={message.id}>
      {message.attachmentName ? <span className="figma-prior-attachment">{message.attachmentName}</span> : null}
      <p>{message.content}</p>
    </div>;
  }
  if (message.metadata?.result) {
    return <div className="figma-prior-result" key={message.id}>
      <ResultStage result={message.metadata.result} activities={message.metadata.toolActivity} locale={locale} />
    </div>;
  }
  return <p className="figma-followup-answer" key={message.id}>{message.content}</p>;
}
