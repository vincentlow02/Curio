"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, AnalysisSessionView, AnalysisStage, ToolActivity } from "../../../core/analysis/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { COLLECTIBLE_CATEGORIES, type CollectibleCategory, type DetectionResult } from "../../../core/profile/types";
import { loadRecentImage, saveRecentImage } from "../storage/recent-image-store";

const categories = [
  { id: "toys", title: "Toys & Character Collectibles" as CollectibleCategory, label: <>Toys &amp; Character<br />Collectibles</>, image: "/figma/category-toys.png" },
  { id: "games", title: "Cards & Game Collectibles" as CollectibleCategory, label: <>Cards &amp; Game<br />Collectibles</>, image: "/figma/category-games.png" },
  { id: "music", title: "Records & Music Collectibles" as CollectibleCategory, label: <>Records &amp; Music<br />Collectibles</>, image: "/figma/category-music.png" },
] as const;

const researchSteps: Array<{ status: AnalysisStage; label: string }> = [
  { status: "searching_marketplaces", label: "Searching Rakuten and Mercari listings" },
  { status: "searching_auctions", label: "Checking Yahoo! Auctions and Mandarake Auction" },
  { status: "searching_fallback", label: "Checking a controlled fallback when needed" },
  { status: "processing_prices", label: "Calculating the reference range and verifying it in an isolated sandbox" },
];

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
  initialHistory?: RecentAnalysisRecord | null;
  onHistorySave?: (record: RecentAnalysisRecord) => void;
  onHistoryPromote?: (id: string) => void;
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

function stageMessage(status: AnalysisStage | null, fallback?: string): string {
  const messages: Partial<Record<AnalysisStage, string>> = {
    queued: "Waiting to start the analysis",
    identifying: "Identifying the collectible",
    identified: "Identification complete",
    queued_research: "Research has been added to the queue",
    searching_marketplaces: "Searching Rakuten and Mercari asking-price listings",
    searching_auctions: "Searching Yahoo! Auctions and Mandarake Auction",
    searching_fallback: "Running one controlled fallback search",
    processing_prices: "Calculating the reference range and checking sandbox consistency",
    completed: "Analysis complete",
    needs_review: "More identification details are needed",
    failed: "Analysis stopped",
  };
  return (status && messages[status]) || fallback || "Starting live analysis";
}

function areaName(name: string): string {
  return ({ "秋葉原": "Akihabara", "中野": "Nakano", "池袋": "Ikebukuro", "新宿": "Shinjuku", "渋谷": "Shibuya" } as Record<string, string>)[name] ?? name;
}

function areaReason(name: string, fallback: string): string {
  const reasons: Record<string, string> = {
    "秋葉原": "A dense area for second-hand collectibles, games and specialist hobby shops.",
    "中野": "Specialist collectible shops make this a strong area for character goods and vintage toys.",
    "池袋": "A useful area for comparing game, card and second-hand hobby stores.",
    "新宿": "A strong area for second-hand records, CDs and specialist music retailers.",
    "渋谷": "A well-known record-shopping area with major and independent music stores.",
  };
  return reasons[name] ?? fallback;
}

function errorCopy(message: string | null | undefined): string {
  if (!message) return "The analysis could not continue.";
  if (/无法可靠判断收藏品类别/.test(message)) return "The collectible category could not be identified reliably. Try a clearer image or add the brand and model.";
  if (/任务不存在|已经过期/.test(message)) return "The analysis session does not exist or has expired.";
  if (/分析服务暂时不可用/.test(message)) return "The analysis service is temporarily unavailable. Please try again.";
  return message;
}

function activityCopy(activity: ToolActivity, identification: DetectionResult, sampleCount: number): { title: string; description: string } {
  const valid = activity.validResultCount ?? 0;
  const candidates = activity.resultCount ?? 0;
  switch (activity.provider) {
    case "Qwen":
      return {
        title: "Identified the collectible",
        description: `Qwen ${activity.model ?? "vision model"} identified ${identification.itemName} and generated the Japanese price-search keyword. ${activity.inputTokens ?? 0} input / ${activity.outputTokens ?? 0} output tokens.`,
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

export function FigmaLiveComposer({ initialHistory = null, onHistorySave, onHistoryPromote }: Props): React.ReactElement {
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
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [nextText, setNextText] = useState("");
  const [nextFile, setNextFile] = useState<File | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const [researchStarting, setResearchStarting] = useState(false);
  const pendingInputRef = useRef<PendingInput | null>(null);
  const pendingResearchRef = useRef(false);
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
  const submitActive = Boolean(selectedImage || query.trim());

  useEffect(() => {
    setSpeechSupported("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
    setAccessCode(sessionStorage.getItem("collectible-demo-code") ?? "");
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
        const code = sessionStorage.getItem("collectible-demo-code") ?? "";
        const response = await fetch(`/api/analysis/${encodeURIComponent(sessionId)}`, { headers: { "X-Demo-Code": code }, cache: "no-store" });
        if (response.status === 401) {
          sessionStorage.removeItem("collectible-demo-code");
          setAccessError("Access Code expired or is invalid.");
          setAccessOpen(true);
          return;
        }
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
  }, [pollRevision, sessionId, session?.status]);

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

  async function createAnalysis(input: PendingInput, code: string): Promise<void> {
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
    try {
      const response = await fetch("/api/analysis", { method: "POST", headers: { "X-Demo-Code": code }, body: data });
      const body = await response.json() as { sessionId?: string; error?: string; code?: string };
      if (response.status === 401) {
        sessionStorage.removeItem("collectible-demo-code");
        pendingInputRef.current = input;
        setAccessError("Invalid Access Code.");
        setAccessOpen(true);
        setCreating(false);
        return;
      }
      if (response.status === 422 && body.code === "needs_clarification") {
        setCreating(false);
        setClarificationRequested(true);
        return;
      }
      if (!response.ok || !body.sessionId) throw new Error(body.error ?? "Unable to create analysis.");
      sessionStorage.setItem("collectible-demo-code", code);
      if (input.file) await saveRecentImage(body.sessionId, input.file).catch(() => undefined);
      setSessionId(body.sessionId);
    } catch (caught) {
      setCreating(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function submitInput(input: PendingInput): void {
    if (!input.file && !input.text.trim()) return;
    const code = sessionStorage.getItem("collectible-demo-code") ?? "";
    if (!code) {
      pendingInputRef.current = input;
      setAccessOpen(true);
      return;
    }
    if (!input.file && !isSpecificDescription(input.text)) {
      setClarificationRequested(true);
      return;
    }
    void createAnalysis(input, code);
  }

  function submitAccessCode(): void {
    const code = accessCode.trim();
    if (!code) { setAccessError("Enter the Demo Access Code."); return; }
    if (pendingResearchRef.current) {
      pendingResearchRef.current = false;
      setAccessError(null);
      setAccessOpen(false);
      void continueResearch(code);
      return;
    }
    const pending = pendingInputRef.current;
    if (!pending) {
      sessionStorage.setItem("collectible-demo-code", code);
      setAccessError(null);
      setAccessOpen(false);
      setPollRevision((current) => current + 1);
      return;
    }
    setAccessError(null);
    setAccessOpen(false);
    void createAnalysis(pending, code);
  }

  async function continueResearch(codeOverride?: string): Promise<void> {
    if (!sessionId || !recognitionDraft || status !== "identified" || researchStarting) return;
    setResearchStarting(true);
    setError(null);
    const code = codeOverride ?? sessionStorage.getItem("collectible-demo-code") ?? "";
    try {
      const response = await fetch(`/api/analysis/${encodeURIComponent(sessionId)}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Demo-Code": code },
        body: JSON.stringify({ identification: recognitionDraft }),
      });
      const body = await response.json() as { error?: string; status?: AnalysisStage; queuePosition?: number };
      if (response.status === 401) {
        sessionStorage.removeItem("collectible-demo-code");
        pendingResearchRef.current = true;
        setResearchStarting(false);
        setAccessError("Invalid Access Code.");
        setAccessOpen(true);
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Unable to start research.");
      sessionStorage.setItem("collectible-demo-code", code);
      onHistoryPromote?.(sessionId);
      setSession((current) => current ? { ...current, status: "queued_research", progress: 36, message: "Research queued", queuePosition: body.queuePosition ?? null, identification: recognitionDraft } : current);
    } catch (caught) {
      setResearchStarting(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function updateRecognized<Key extends keyof DetectionResult>(key: Key, value: DetectionResult[Key]): void {
    setRecognitionDraft((current) => current ? { ...current, [key]: value } : current);
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
      <header className="figma-home-heading"><h1 id="collectible-heading">What are you looking for ?</h1><p>Discover where to look in Tokyo and what price to expect.</p></header>
      <div className={`figma-category-grid${selectedCategory ? " is-hidden" : ""}`}>
        {categories.map((category) => <button className={`figma-category-card figma-category-card--${category.id}`} type="button" key={category.id} onClick={() => setSelectedCategory(category)} disabled={Boolean(selectedCategory)}>
          <span className="figma-category-visual"><span className="figma-category-image"><img src={category.image} alt="" /></span><span className="figma-category-label">{category.label}</span></span>
        </button>)}
      </div>
    </div> : null}

    {!isConversation ? <>
      {clarificationRequested ? <div className="figma-clarification-bubble" role="status"><p>Please add a brand, character, model number, series, title, or other identifying detail.</p></div> : null}
      <form className={`figma-composer-box${selectedImage ? " has-image" : ""}${selectedCategory ? " has-category" : ""}`} onSubmit={(event) => { event.preventDefault(); submitInput({ file: selectedImage?.file ?? null, text: query.trim(), category: selectedCategory?.title ?? null, collectorMode }); }}>
        <div className="figma-composer-content">
          {selectedImage ? <div className="figma-upload-preview"><img className="figma-upload-preview__image" src={selectedImage.url} alt={selectedImage.name} /><button type="button" aria-label="Remove uploaded image" onClick={clearImage}><img src="/figma/upload-preview-remove.svg" alt="" /></button></div> : null}
          {selectedCategory ? <div className="figma-selected-category"><span>{selectedCategory.title}</span><button type="button" aria-label="Remove category" onClick={() => setSelectedCategory(null)}>×</button></div> : null}
          <textarea rows={1} aria-label="Describe collectible" value={query} onInput={(event) => updateQuery(event.currentTarget, setQuery)} onChange={(event) => setQuery(event.target.value)} placeholder={selectedCategory ? "" : "Upload a photo or describe what you’re looking for"} />
        </div>
        <div className="figma-composer-actions">
          <div className="figma-composer-actions-left">
            <div className="figma-upload-control" ref={uploadMenuRef}>
              <button className="figma-composer-round-button" type="button" aria-label="Add attachment or mode" aria-expanded={uploadMenuOpen} onClick={() => setUploadMenuOpen((open) => !open)}><img src="/figma/composer-add.svg" alt="" /></button>
              {uploadMenuOpen ? <div className="figma-upload-menu" role="menu">
                <button type="button" onClick={() => { setUploadMenuOpen(false); cameraInputRef.current?.click(); }}><img className="figma-upload-menu__camera" src="/figma/upload-menu-camera.svg" alt="" /><span>Take Photo</span></button>
                <button type="button" onClick={() => { setUploadMenuOpen(false); imageInputRef.current?.click(); }}><img className="figma-upload-menu__image" src="/figma/upload-menu-image.svg" alt="" /><span>Upload Image</span></button>
                <button className="figma-upload-menu__file-row" type="button" onClick={() => { setUploadMenuOpen(false); fileInputRef.current?.click(); }}><img className="figma-upload-menu__file" src="/figma/upload-menu-file.svg" alt="" /><span>Upload file</span></button>
                <button className={`figma-upload-menu__collector${collectorMode ? " is-selected" : ""}`} type="button" role="menuitemcheckbox" aria-checked={collectorMode} onClick={() => { setCollectorMode((enabled) => !enabled); setUploadMenuOpen(false); }}><span className="figma-collector-spark" aria-hidden="true">✧</span><span>Collector Mode</span>{collectorMode ? <span className="figma-upload-menu__check" aria-hidden="true">✓</span> : null}</button>
              </div> : null}
              <input ref={cameraInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
              <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
              <input ref={fileInputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} />
            </div>
            {collectorMode ? <button className="figma-collector-chip" type="button" aria-label="Disable Collector Mode" title="Disable Collector Mode" onClick={() => setCollectorMode(false)}><span className="figma-collector-spark" aria-hidden="true">✧</span><b>Collector Mode</b><span className="figma-collector-info" aria-hidden="true">i</span></button> : null}
          </div>
          <div className="figma-composer-actions-right">
            {speechSupported ? <button className="figma-composer-microphone" type="button" aria-label="Use microphone" onClick={() => startSpeech(setQuery)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}
            <button className={`figma-composer-round-button figma-composer-submit${submitActive ? " is-active" : ""}`} type="submit" disabled={!submitActive || creating} aria-label="Submit"><img src={submitActive ? "/figma/composer-submit-active.svg" : "/figma/composer-submit.svg"} alt="" /></button>
          </div>
        </div>
      </form>
    </> : <div className="figma-chat-thread" aria-live="polite">
      <div className="figma-chat-user-message">{selectedImage ? <img src={selectedImage.url} alt={selectedImage.name} /> : null}<p>{submittedText || "Please identify this collectible."}</p></div>

      {creating || status === "queued" || status === "identifying" ? <div className="figma-recognition-card is-analyzing"><div className="figma-recognition-loading-image" /><div className="figma-recognition-loading-copy"><strong>{stageMessage(status, session?.message)}</strong><span>Qwen is identifying the Japanese item name, version, category and Japanese price keyword…</span><i><b /><b /><b /></i></div></div> : null}

      {(status === "needs_review" || status === "failed") ? <div className="figma-live-error" role="alert"><strong>{stageMessage(status, session?.message)}</strong><p>{errorCopy(session?.error ?? error)}</p><button type="button" onClick={resetToNew}>Start a new analysis</button></div> : null}

      {recognitionDraft && status && !["queued", "identifying", "needs_review", "failed"].includes(status) ? <article className="figma-recognition-card">
        <div className="figma-recognition-main">{selectedImage ? <img className="figma-recognition-image" src={selectedImage.url} alt={selectedImage.name} /> : <div className="figma-recognition-image-placeholder" />}
          <dl className="figma-recognition-details">
            <div><dt>Items name：</dt><dd><input ref={itemNameInputRef} aria-label="Item name" disabled={status !== "identified"} value={recognitionDraft.itemName} onChange={(event) => updateRecognized("itemName", event.target.value)} /></dd></div>
            <div><dt>Version/ Period：</dt><dd><input aria-label="Version" disabled={status !== "identified"} value={recognitionDraft.version} onChange={(event) => updateRecognized("version", event.target.value)} /></dd></div>
            <div><dt>Category：</dt><dd><select aria-label="Category" disabled={status !== "identified"} value={recognitionDraft.category} onChange={(event) => updateRecognized("category", event.target.value as CollectibleCategory)}>{COLLECTIBLE_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></dd></div>
            <div><dt>Price search keyword：</dt><dd><input lang="ja" aria-label="Price keyword" disabled={status !== "identified"} value={recognitionDraft.priceSearchKeywordJa} onChange={(event) => updateRecognized("priceSearchKeywordJa", event.target.value)} /></dd></div>
          </dl>
        </div>
        {session?.collectorMode && session.collectorEvidence ? <div className="figma-collector-evidence-preview"><b>Collector evidence</b><span>{session.collectorEvidence.editionSignals.length + session.collectorEvidence.conditionSignals.length + session.collectorEvidence.visibleIdentifiers.length} visible signals · {session.collectorEvidence.missingEvidence.length} unresolved</span></div> : null}
        <div className="figma-recognition-actions"><button className="figma-recognition-edit" type="button" disabled={status !== "identified" || researchStarting} onClick={() => itemNameInputRef.current?.focus()}><img src="/figma/toolbar-edit.svg" alt="" /><span>Edit</span></button><button className="figma-recognition-continue" type="button" disabled={status !== "identified" || researchStarting} onClick={() => void continueResearch()}>{researchStarting ? "Starting…" : "Continue research"}</button></div>
      </article> : null}

      {isResearch && status !== "completed" ? <section className="figma-agent-process"><div className="figma-agent-process__heading"><span className="figma-agent-process__spinner" /><div><strong>{stageMessage(status, session?.message)}</strong><p>Using live public sources and deterministic processing.</p></div></div><ol>{researchSteps.filter((step) => collectorMode || step.status !== "searching_auctions").map((step) => {
        const current = stageIndex(status!); const stepPosition = stageIndex(step.status); const state = current > stepPosition ? "complete" : current === stepPosition ? "active" : "pending";
        return <li className={state} key={step.status}><span>{state === "complete" ? "✓" : ""}</span><p>{step.label}</p></li>;
      })}</ol></section> : null}

      {status === "completed" && result ? <>
        <section className="figma-agent-answer"><div className="figma-agent-answer__intro"><div><h2>Here’s what I found</h2><p>{result.priceReference.sampleCount ? `I found ${result.priceReference.sampleCount} comparable public listings and prepared Tokyo areas to check.` : "The item was identified, but there were not enough comparable public listings for a responsible price range."}</p></div></div>
          <article className="figma-agent-result-card"><header><div><span>ONLINE ASKING-PRICE REFERENCE</span><h3>{result.identification.itemName}</h3></div><b>JPY</b></header><div className="figma-agent-price-range"><div><span>Low</span><strong>{formatYen(result.priceReference.low)}</strong></div><div className="is-median"><span>Typical</span><strong>{formatYen(result.priceReference.median)}</strong></div><div><span>High</span><strong>{formatYen(result.priceReference.high)}</strong></div></div><p className="figma-agent-result-note">Based on {result.priceReference.sampleCount} comparable public listings. {result.priceReference.disclaimer}, not a confirmed transaction price.</p></article>
          {result.collectorMode && result.collectorEvidence ? <div className="figma-agent-section figma-collector-evidence"><h3>Collector evidence</h3><div className="figma-collector-evidence-grid"><article><b>Edition signals</b><ul>{result.collectorEvidence.editionSignals.length ? result.collectorEvidence.editionSignals.map((item) => <li key={item}>{item}</li>) : <li>None visible</li>}</ul></article><article><b>Visible condition</b><ul>{result.collectorEvidence.conditionSignals.length ? result.collectorEvidence.conditionSignals.map((item) => <li key={item}>{item}</li>) : <li>None visible</li>}</ul></article><article><b>Visible identifiers</b><ul>{result.collectorEvidence.visibleIdentifiers.length ? result.collectorEvidence.visibleIdentifiers.map((item) => <li key={item}>{item}</li>) : <li>None visible</li>}</ul></article><article><b>Missing evidence</b><ul>{result.collectorEvidence.missingEvidence.length ? result.collectorEvidence.missingEvidence.map((item) => <li key={item}>{item}</li>) : <li>No missing evidence was recorded</li>}</ul></article></div></div> : null}
          {result.collectorMode ? <div className="figma-agent-section figma-auction-watch"><h3>Auction watch</h3><p className="figma-auction-disclaimer">Active auction prices can change before closing and are not confirmed sale prices.</p>{result.auctionSources.map((source) => <article key={source.source}><header><div><b>{source.source === "Yahoo Auctions" ? "Yahoo! Auctions" : source.source}</b><span>{source.comparableSignals} comparable signals</span></div><small>{source.status.replace("_", " ")}</small></header>{source.signals.length ? <div>{source.signals.map((signal) => <a href={signal.url} target="_blank" rel="noreferrer" key={signal.url}><div><b>{signal.title}</b><span>{signal.bidCount === null ? "Bids unknown" : `${signal.bidCount} bids`} · {signal.remainingTime}</span>{signal.unresolvedDifferences.length ? <small>{signal.unresolvedDifferences.join(" · ")}</small> : null}</div><dl><div><dt>Current</dt><dd>{formatYen(signal.currentPrice)}</dd></div>{signal.startingPrice !== null ? <div><dt>Starting</dt><dd>{formatYen(signal.startingPrice)}</dd></div> : null}{signal.buyNowPrice !== null ? <div><dt>Buy now</dt><dd>{formatYen(signal.buyNowPrice)}</dd></div> : null}</dl></a>)}</div> : <p className="figma-auction-empty">No comparable public signals from this source.</p>}</article>)}</div> : null}
          <div className="figma-agent-section"><h3>Where to look in Tokyo</h3><div className="figma-agent-area-grid">{result.recommendedAreas.map((area) => <article key={area.area}><b>{areaName(area.area)}</b><p>{areaReason(area.area, area.reason)}</p><code lang="ja">{area.searchKeywordJa}</code><a className="figma-area-map-link" href={mapsUrl(area.searchKeywordJa)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a></article>)}</div></div>
          {result.storeSuggestions.length ? <div className="figma-agent-section"><h3>Sourced store suggestions</h3><div className="figma-store-suggestions">{result.storeSuggestions.map((store) => <a href={store.sourceUrl} target="_blank" rel="noreferrer" key={`${store.name}-${store.sourceUrl}`}><b>{store.name}</b><span>{store.reason}</span></a>)}</div></div> : null}
          <details className="figma-agent-sources"><summary><span>View price sources</span><span className="figma-source-brand-stack" aria-hidden="true"><span><img src="/brands/rakuten.ico" alt="" /></span><span><img src="/brands/mercari.ico" alt="" /></span></span></summary><div>{result.priceReference.samples.map((sample) => <a href={sample.url} target="_blank" rel="noreferrer" key={`${sample.source}-${sample.url}`}><span className="figma-marketplace-brand">{sample.source === "Web fallback" ? "W" : <img src={sample.source === "Rakuten" ? "/brands/rakuten.ico" : "/brands/mercari.ico"} alt="" />}<span className="sr-only">{sample.source}</span></span><p>{sample.title}</p><b>{formatYen(sample.price)}</b></a>)}</div></details>
          <details className="figma-run-details"><summary><span>Run details</span><small>{activities.length} steps · {activityDuration(result.cost.totalMs)}</small></summary><ol>{activities.map((activity) => {
            const copy = activityCopy(activity, result.identification, result.priceReference.sampleCount);
            const effectiveStatus = result && activity.status === "running" ? "succeeded" : activity.status;
            return <li className={`is-${effectiveStatus}`} key={activity.provider}><span className="figma-run-marker">{effectiveStatus === "skipped" ? "—" : effectiveStatus === "failed" || effectiveStatus === "fallback" ? "!" : "✓"}</span><div><b>{copy.title}</b><p>{copy.description}</p></div><time>{activityDuration(activity.durationMs)}</time></li>;
          })}<li className="is-succeeded is-total"><span className="figma-run-marker">✓</span><div><b>Completed the research run</b><p>Prepared an online asking-price reference from {result.priceReference.sampleCount} comparable samples and generated Tokyo area suggestions.</p></div><time>{activityDuration(result.cost.totalMs)}</time></li></ol></details>
        </section>
        <form className="figma-followup-composer" onSubmit={(event) => { event.preventDefault(); const text = nextText.trim(); const file = nextFile; resetToNew(); submitInput({ file, text, category: null, collectorMode: false }); }}><textarea rows={1} value={nextText} onChange={(event) => setNextText(event.target.value)} placeholder={nextFile ? nextFile.name : "Upload a photo or describe what you’re looking for"} /><div className="figma-followup-actions"><button className="figma-followup-add" type="button" aria-label="Add image" onClick={() => nextFileInputRef.current?.click()}><img src="/figma/composer-add.svg" alt="" /></button><input ref={nextFileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNextFile(event.target.files?.[0] ?? null)} /><div className="figma-followup-actions-right">{speechSupported ? <button className="figma-followup-microphone" type="button" onClick={() => startSpeech(setNextText)}><img src="/figma/composer-microphone.svg" alt="" /></button> : <span />}<button className="figma-followup-submit" type="submit" disabled={!nextText.trim() && !nextFile}><img src="/figma/composer-submit-active.svg" alt="" /></button></div></div></form>
      </> : null}
      {error && status !== "failed" ? <div className="figma-inline-error" role="alert">{error}</div> : null}
    </div>}

    {accessOpen ? <div className="figma-access-backdrop" role="presentation"><form className="figma-access-dialog" onSubmit={(event) => { event.preventDefault(); submitAccessCode(); }}><h2>Demo Access</h2><p>Enter the Access Code to start a live Agent run.</p><label htmlFor="demo-access-code">Access Code</label><input id="demo-access-code" type="password" autoFocus value={accessCode} onChange={(event) => setAccessCode(event.target.value)} autoComplete="off" />{accessError ? <p className="figma-access-error">{accessError}</p> : null}<div><button type="button" onClick={() => setAccessOpen(false)}>Cancel</button><button type="submit">Continue</button></div></form></div> : null}
  </section>;
}
