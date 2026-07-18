"use client";

import { useEffect, useRef, useState } from "react";
import { COLLECTIBLE_CATEGORIES, type CollectibleCategory } from "../../../core/profile/types";

const categories = [
  {
    id: "toys",
    title: "Toys & Character Collectibles" as CollectibleCategory,
    label: <>Toys &amp; Character<br />Collectibles</>,
    image: "/figma/category-toys.png",
  },
  {
    id: "games",
    title: "Cards & Game Collectibles" as CollectibleCategory,
    label: <>Cards &amp; Game<br />Collectibles</>,
    image: "/figma/category-games.png",
  },
  {
    id: "music",
    title: "Records & Music Collectibles" as CollectibleCategory,
    label: <>Records &amp; Music<br />Collectibles</>,
    image: "/figma/category-music.png",
  },
] as const;

type ComposerStage = "composing" | "analyzing" | "recognized" | "researching" | "complete";
type IdentificationMode = "image" | "text";
type RecognitionDraft = {
  itemName: string;
  version: string;
  category: CollectibleCategory;
  keyword: string;
};

export type RecentAnalysisRecord = {
  id: string;
  title: string;
  submittedText: string;
  recognition: RecognitionDraft;
  completedResearch: boolean;
  createdAt: string;
};

type FigmaHomeComposerProps = {
  initialHistory?: RecentAnalysisRecord | null;
  onHistorySave?: (record: RecentAnalysisRecord) => void;
};

const recognitionFixtures: Record<CollectibleCategory, { itemName: string; version: string; keyword: string }> = {
  "Toys & Character Collectibles": {
    itemName: "My Neighbor Totoro Plush",
    version: "Medium Plush / 2001–2008",
    keyword: "となりのトトロ ぬいぐるみ M 中古",
  },
  "Cards & Game Collectibles": {
    itemName: "Sony PlayStation Portable",
    version: "PSP-3000 / unknown",
    keyword: "PSP-3000 本体 中古",
  },
  "Records & Music Collectibles": {
    itemName: "Japanese City Pop Vinyl",
    version: "LP Record / unknown",
    keyword: "シティポップ レコード LP 中古",
  },
};

const researchSteps = [
  "Searching Rakuten and Mercari listings",
  "Filtering comparable versions and conditions",
  "Calculating the online asking-price range",
  "Preparing Tokyo area suggestions",
] as const;

const researchFixtures: Record<CollectibleCategory, {
  summary: string;
  low: number;
  median: number;
  high: number;
  sampleCount: number;
  areas: Array<{ name: string; reason: string; keyword: string }>;
  samples: Array<{ source: "Rakuten" | "Mercari"; title: string; price: number; url: string }>;
}> = {
  "Toys & Character Collectibles": {
    summary: "Comparable character collectible listings suggest the following asking-price range. For physical shopping, Nakano and Akihabara are the strongest areas to check first.",
    low: 2500, median: 3800, high: 6200, sampleCount: 5,
    areas: [
      { name: "Nakano", reason: "Strong concentration of character collectibles, vintage toys and specialist resale shops.", keyword: "中野 中古 フィギュア ソフビ 店舗" },
      { name: "Akihabara", reason: "Many figure, hobby and second-hand character goods stores within walking distance.", keyword: "秋葉原 中古 キャラクターグッズ 店舗" },
    ],
    samples: [
      { source: "Rakuten", title: "中古 キャラクター フィギュア", price: 2500, url: "https://search.rakuten.co.jp/search/mall/中古+フィギュア/" },
      { source: "Mercari", title: "ソフビ・キャラクターグッズ", price: 3800, url: "https://jp.mercari.com/search?keyword=ソフビ%20中古" },
      { source: "Mercari", title: "中古 コレクタブル フィギュア", price: 6200, url: "https://jp.mercari.com/search?keyword=フィギュア%20中古" },
    ],
  },
  "Cards & Game Collectibles": {
    summary: "Comparable gaming listings indicate a broad range depending on condition, accessories and packaging. Akihabara is the best first stop, with Ikebukuro as a useful second area.",
    low: 8000, median: 12000, high: 16000, sampleCount: 6,
    areas: [
      { name: "Akihabara", reason: "Dense concentration of retro-game, console and card specialty stores.", keyword: "秋葉原 中古 ゲーム 本体 店舗" },
      { name: "Ikebukuro", reason: "Useful mix of game, card and second-hand hobby stores for comparison.", keyword: "池袋 中古 ゲーム カードショップ" },
    ],
    samples: [
      { source: "Rakuten", title: "中古 PSP-3000 本体", price: 8000, url: "https://search.rakuten.co.jp/search/mall/PSP-3000+中古/" },
      { source: "Mercari", title: "PSP-3000 本体 ホワイト", price: 12000, url: "https://jp.mercari.com/search?keyword=PSP-3000%20本体" },
      { source: "Mercari", title: "PSP-3000 本体 箱付き", price: 16000, url: "https://jp.mercari.com/search?keyword=PSP-3000%20箱付き" },
    ],
  },
  "Records & Music Collectibles": {
    summary: "Public listings suggest the following asking-price range for comparable music collectibles. Shinjuku and Shibuya offer the strongest clusters of record and music-specialty stores.",
    low: 1800, median: 3200, high: 5800, sampleCount: 5,
    areas: [
      { name: "Shinjuku", reason: "Large selection of used vinyl, CDs and specialist music retailers.", keyword: "新宿 中古 レコード CD 店" },
      { name: "Shibuya", reason: "Well-known record-shopping area with both major and independent stores.", keyword: "渋谷 中古 レコード 専門店" },
    ],
    samples: [
      { source: "Rakuten", title: "中古 シティポップ LP", price: 1800, url: "https://search.rakuten.co.jp/search/mall/シティポップ+LP+中古/" },
      { source: "Mercari", title: "シティポップ レコード", price: 3200, url: "https://jp.mercari.com/search?keyword=シティポップ%20レコード" },
      { source: "Mercari", title: "邦楽 LP レコード", price: 5800, url: "https://jp.mercari.com/search?keyword=邦楽%20LP%20レコード" },
    ],
  },
};

function formatYen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

const vagueDescriptions = new Set([
  "toy", "toys", "figure", "game", "card", "record", "cd", "collectible", "something", "this",
  "玩具", "手办", "公仔", "游戏", "卡牌", "唱片", "这个", "不知道", "收藏品",
  "おもちゃ", "フィギュア", "ゲーム", "カード", "レコード", "これ", "わからない",
]);

function isSpecificDescription(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[,.!?，。！？]/g, " ").replace(/\s+/g, " ");
  if (!normalized || vagueDescriptions.has(normalized)) return false;
  if (/\d/.test(normalized)) return true;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length >= 2 && words.some((word) => !vagueDescriptions.has(word))) return true;
  return normalized.length >= 8;
}

function inferTextCategory(value: string, selected?: CollectibleCategory): CollectibleCategory {
  if (selected) return selected;
  const text = value.toLowerCase();
  if (/psp|playstation|xbox|nintendo|game\s?boy|switch|console|ゲーム|卡牌|卡片|pokemon|pokémon|遊戯王|游戏|主机/.test(text)) return "Cards & Game Collectibles";
  if (/vinyl|record|\bcd\b|cassette|album|レコード|音楽|唱片|黑胶|磁带|音乐/.test(text)) return "Records & Music Collectibles";
  return "Toys & Character Collectibles";
}

export function FigmaHomeComposer({ initialHistory = null, onHistorySave }: FigmaHomeComposerProps): React.ReactElement {
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [query, setQuery] = useState(initialHistory?.submittedText ?? "");
  const [selectedCategory, setSelectedCategory] = useState<(typeof categories)[number] | null>(() => categories.find((category) => category.title === initialHistory?.recognition.category) ?? null);
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const [stage, setStage] = useState<ComposerStage>(() => initialHistory ? (initialHistory.completedResearch ? "complete" : "recognized") : "composing");
  const [submittedText, setSubmittedText] = useState(initialHistory?.submittedText ?? "");
  const [recognitionDraft, setRecognitionDraft] = useState<RecognitionDraft | null>(initialHistory?.recognition ?? null);
  const [researchStep, setResearchStep] = useState(0);
  const [identificationMode, setIdentificationMode] = useState<IdentificationMode>("image");
  const [clarificationRequested, setClarificationRequested] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState(initialHistory?.id ?? "");
  const [historyCreatedAt, setHistoryCreatedAt] = useState(initialHistory?.createdAt ?? "");
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const researchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!uploadMenuOpen) return;

    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!uploadMenuRef.current?.contains(event.target as Node)) {
        setUploadMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setUploadMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [uploadMenuOpen]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current);
    if (researchTimerRef.current) clearInterval(researchTimerRef.current);
  }, []);

  useEffect(() => {
    if (!onHistorySave || !recognitionDraft || !currentHistoryId || (stage !== "recognized" && stage !== "complete")) return;
    onHistorySave({
      id: currentHistoryId,
      title: recognitionDraft.itemName || "Untitled collectible",
      submittedText,
      recognition: recognitionDraft,
      completedResearch: stage === "complete",
      createdAt: historyCreatedAt || new Date().toISOString(),
    });
  }, [currentHistoryId, historyCreatedAt, onHistorySave, recognitionDraft, stage, submittedText]);

  const openPicker = (input: HTMLInputElement | null): void => {
    setUploadMenuOpen(false);
    input?.click();
  };

  const handleImageSelected = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return;

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setSelectedImage({ name: file.name, url });
    setClarificationRequested(false);
  };

  const clearSelectedImage = (): void => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setSelectedImage(null);
    for (const input of [cameraInputRef.current, imageInputRef.current, fileInputRef.current]) {
      if (input) input.value = "";
    }
  };

  const updateQuery = (textarea: HTMLTextAreaElement): void => {
    const maximumHeight = 75;
    textarea.style.height = "15px";
    const nextHeight = Math.min(textarea.scrollHeight, maximumHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maximumHeight ? "auto" : "hidden";
    setQuery(textarea.value);
  };

  const submitActive = Boolean(selectedImage || query.trim());

  const submitForRecognition = (): void => {
    if (!submitActive) return;
    const text = query.trim();
    if (!selectedImage && !isSpecificDescription(text) && !clarificationRequested) {
      setClarificationRequested(true);
      return;
    }
    const mode: IdentificationMode = selectedImage ? "image" : "text";
    const category = inferTextCategory(text, selectedCategory?.title);
    const fixture = mode === "image"
      ? recognitionFixtures[category]
      : { itemName: text, version: "unknown", keyword: /中古/.test(text) ? text : `${text} 中古` };
    setUploadMenuOpen(false);
    setSubmittedText(text);
    setCurrentHistoryId(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    setHistoryCreatedAt(new Date().toISOString());
    setIdentificationMode(mode);
    setClarificationRequested(false);
    setRecognitionDraft({ ...fixture, category });
    setStage("analyzing");
    recognitionTimerRef.current = setTimeout(() => setStage("recognized"), 1400);
  };

  const editSubmission = (): void => {
    if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current);
    recognitionTimerRef.current = null;
    setStage("composing");
    setClarificationRequested(false);
  };

  const continueResearch = (): void => {
    if (researchTimerRef.current) clearInterval(researchTimerRef.current);
    setResearchStep(0);
    setStage("researching");
    let nextStep = 0;
    researchTimerRef.current = setInterval(() => {
      nextStep += 1;
      if (nextStep >= researchSteps.length) {
        if (researchTimerRef.current) clearInterval(researchTimerRef.current);
        researchTimerRef.current = null;
        setResearchStep(researchSteps.length);
        setStage("complete");
        return;
      }
      setResearchStep(nextStep);
    }, 850);
  };

  const resolvedCategory = selectedCategory?.title ?? "Toys & Character Collectibles";
  const recognizedItem = recognitionDraft ?? { ...recognitionFixtures[resolvedCategory], category: resolvedCategory };
  const researchResult = researchFixtures[recognizedItem.category];

  const updateRecognizedField = <Key extends keyof RecognitionDraft>(key: Key, value: RecognitionDraft[Key]): void => {
    setRecognitionDraft((current) => current ? { ...current, [key]: value } : current);
  };

  return (
    <section
      className={`figma-home-composer${selectedCategory ? " has-selected-category" : ""}${selectedImage ? " has-selected-image" : ""}${clarificationRequested ? " needs-clarification" : ""}${stage !== "composing" ? " is-conversation" : ""}${stage === "researching" || stage === "complete" ? " is-research" : ""}`}
      data-node-id={selectedCategory ? "10:197" : "10:20"}
      aria-labelledby="collectible-heading"
    >
      <div className="figma-home-discovery" data-node-id="9:135">
        <header className="figma-home-heading" data-node-id="9:136">
          <h1 id="collectible-heading">What are you looking for ?</h1>
          <p>Discover where to look in Tokyo and what price to expect.</p>
        </header>

        <div className={`figma-category-grid${selectedCategory || stage !== "composing" ? " is-hidden" : ""}`} data-node-id="9:139" aria-hidden={Boolean(selectedCategory || stage !== "composing")}>
            {categories.map((category) => (
              <button
                className={`figma-category-card figma-category-card--${category.id}`}
                type="button"
                key={category.id}
                onClick={() => setSelectedCategory(category)}
                disabled={Boolean(selectedCategory)}
                tabIndex={selectedCategory ? -1 : 0}
              >
                <span className="figma-category-visual">
                  <span className="figma-category-image"><img src={category.image} alt="" /></span>
                  <span className="figma-category-label">{category.label}</span>
                </span>
              </button>
            ))}
        </div>
      </div>

      {stage === "composing" ? (
      <>
      {clarificationRequested ? (
        <div className="figma-clarification-bubble" role="status">
          <p>Please add a brand, character, model number, series, title, or other identifying detail.</p>
        </div>
      ) : null}
      <form
        className={`figma-composer-box${selectedImage ? " has-image" : ""}${selectedCategory ? " has-category" : ""}`}
        data-node-id={selectedImage ? "10:197" : "2:162"}
        onInput={(event) => {
          if (event.target instanceof HTMLTextAreaElement) updateQuery(event.target);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          submitForRecognition();
        }}
      >
        {selectedCategory ? <input type="hidden" name="category" value={selectedCategory.title} /> : null}
        <div className="figma-composer-content" data-node-id={selectedImage ? "9:174" : undefined}>
          {selectedImage ? (
            <div className="figma-upload-preview" data-node-id="9:171">
              <img className="figma-upload-preview__image" src={selectedImage.url} alt={selectedImage.name} />
              <button type="button" aria-label="Remove uploaded image" onClick={clearSelectedImage}>
                <img src="/figma/upload-preview-remove.svg" alt="" />
              </button>
            </div>
          ) : null}
          {selectedCategory ? (
            <div className="figma-selected-category" aria-label="Selected category">
              <span>{selectedCategory.title}</span>
              <button type="button" aria-label={`Remove ${selectedCategory.title} category`} onClick={() => setSelectedCategory(null)}>×</button>
            </div>
          ) : null}
          <label className="sr-only" htmlFor="collectible-query">Describe what you are looking for</label>
          <textarea id="collectible-query" name="query" rows={1} placeholder={selectedCategory ? "" : "Upload a photo or describe what you’re looking for"} />
        </div>
        <div className="figma-composer-actions" data-node-id="2:164">
          <div className="figma-upload-control" ref={uploadMenuRef}>
            <button
              className="figma-composer-round-button"
              type="button"
              aria-label="Add an image or file"
              aria-haspopup="menu"
              aria-expanded={uploadMenuOpen}
              onClick={() => setUploadMenuOpen((current) => !current)}
            >
              <img src="/figma/composer-add.svg" alt="" />
            </button>

            {uploadMenuOpen ? (
              <div className="figma-upload-menu" role="menu" aria-label="Add attachment" data-node-id="21:125">
                <button type="button" role="menuitem" onClick={() => openPicker(cameraInputRef.current)}>
                  <img className="figma-upload-menu__camera" src="/figma/upload-menu-camera.svg" alt="" />
                  <span>Take Photo</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openPicker(imageInputRef.current)}>
                  <img className="figma-upload-menu__image" src="/figma/upload-menu-image.svg" alt="" />
                  <span>Upload Image</span>
                </button>
                <button className="figma-upload-menu__file-row" type="button" role="menuitem" onClick={() => openPicker(fileInputRef.current)}>
                  <img className="figma-upload-menu__file" src="/figma/upload-menu-file.svg" alt="" />
                  <span>Upload file</span>
                </button>
              </div>
            ) : null}

            <input ref={cameraInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleImageSelected} />
            <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelected} />
            <input ref={fileInputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleImageSelected} />
          </div>
          <div className="figma-composer-actions-right" data-node-id="2:166">
            <button className="figma-composer-microphone" type="button" aria-label="Use microphone">
              <img src="/figma/composer-microphone.svg" alt="" />
            </button>
            <button
              className={`figma-composer-round-button figma-composer-submit${submitActive ? " is-active" : ""}`}
              type="submit"
              aria-label="Submit"
              disabled={!submitActive}
              data-node-id={submitActive ? "9:159" : "2:51"}
            >
              <img src={submitActive ? "/figma/composer-submit-active.svg" : "/figma/composer-submit.svg"} alt="" />
            </button>
          </div>
        </div>
      </form>
      </>
      ) : (
        <div className="figma-chat-thread" aria-live="polite">
          <div className="figma-chat-user-message">
            {selectedImage ? <img src={selectedImage.url} alt={selectedImage.name} /> : null}
            <p>{submittedText || "Please identify this collectible."}</p>
          </div>

          {stage === "analyzing" ? (
            <div className="figma-recognition-card is-analyzing" data-node-id="12:484">
              <div className="figma-recognition-loading-image" />
              <div className="figma-recognition-loading-copy">
                <strong>{identificationMode === "image" ? "Analyzing image" : "Identifying item"}</strong>
                <span>{identificationMode === "image" ? "Identifying the item, version, category and Japanese price keyword…" : "Interpreting the description and preparing a Japanese price-search keyword…"}</span>
                <i><b /><b /><b /></i>
              </div>
            </div>
          ) : (
            <article className="figma-recognition-card" data-node-id="12:484">
              <div className="figma-recognition-main" data-node-id="14:497">
                {selectedImage ? <img className="figma-recognition-image" src={selectedImage.url} alt={selectedImage.name} /> : <div className="figma-recognition-image-placeholder" />}
                <dl className="figma-recognition-details" data-node-id="12:485">
                  <div>
                    <dt>Items name：</dt>
                    <dd><input aria-label="Item name" value={recognizedItem.itemName} onChange={(event) => updateRecognizedField("itemName", event.target.value)} /></dd>
                  </div>
                  <div>
                    <dt>Version/ Period：</dt>
                    <dd><input aria-label="Version or period" value={recognizedItem.version} onChange={(event) => updateRecognizedField("version", event.target.value)} /></dd>
                  </div>
                  <div>
                    <dt>Category：</dt>
                    <dd>
                      <select aria-label="Category" value={recognizedItem.category} onChange={(event) => updateRecognizedField("category", event.target.value as CollectibleCategory)}>
                        {COLLECTIBLE_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}
                      </select>
                    </dd>
                  </div>
                  <div>
                    <dt>Price search keyword：</dt>
                    <dd><input lang="ja" aria-label="Price search keyword" value={recognizedItem.keyword} onChange={(event) => updateRecognizedField("keyword", event.target.value)} /></dd>
                  </div>
                </dl>
              </div>
              <div className="figma-recognition-actions" data-node-id="12:495">
                <button className="figma-recognition-edit" type="button" onClick={editSubmission}>
                  <img src="/figma/toolbar-edit.svg" alt="" />
                  <span>Edit</span>
                </button>
                <button className="figma-recognition-continue" type="button" onClick={continueResearch} disabled={stage === "researching" || stage === "complete"}>Continue research</button>
              </div>
            </article>
          )}

          {stage === "researching" ? (
            <section className="figma-agent-process" aria-label="Research progress">
              <div className="figma-agent-process__heading">
                <span className="figma-agent-process__spinner" />
                <div><strong>Researching this collectible</strong><p>Checking public asking-price references and Tokyo shopping areas.</p></div>
              </div>
              <ol>
                {researchSteps.map((step, index) => {
                  const state = index < researchStep ? "complete" : index === researchStep ? "active" : "pending";
                  return <li className={state} key={step}><span>{state === "complete" ? "✓" : ""}</span><p>{step}</p></li>;
                })}
              </ol>
            </section>
          ) : null}

          {stage === "complete" ? (
            <>
            <section className="figma-agent-answer" aria-label="Collectible research result">
              <div className="figma-agent-answer__intro">
                <div><h2>Here’s what I found</h2><p>{researchResult.summary}</p></div>
              </div>

              <article className="figma-agent-result-card">
                <header><div><span>ONLINE ASKING-PRICE REFERENCE</span><h3>{recognizedItem.itemName}</h3></div><b>JPY</b></header>
                <div className="figma-agent-price-range">
                  <div><span>Low</span><strong>{formatYen(researchResult.low)}</strong></div>
                  <div className="is-median"><span>Typical</span><strong>{formatYen(researchResult.median)}</strong></div>
                  <div><span>High</span><strong>{formatYen(researchResult.high)}</strong></div>
                </div>
                <p className="figma-agent-result-note">Based on {researchResult.sampleCount} comparable public listings. This is an asking-price reference, not a confirmed transaction price.</p>
              </article>

              <div className="figma-agent-section">
                <h3>Where to look in Tokyo</h3>
                <div className="figma-agent-area-grid">
                  {researchResult.areas.map((area) => <article key={area.name}><b>{area.name}</b><p>{area.reason}</p><code lang="ja">{area.keyword}</code></article>)}
                </div>
              </div>

              <details className="figma-agent-sources">
                <summary>
                  <span>View price sources</span>
                  <span className="figma-source-brand-stack" aria-hidden="true">
                    <span><img src="/brands/rakuten.ico" alt="" /></span>
                    <span><img src="/brands/mercari.ico" alt="" /></span>
                  </span>
                </summary>
                <div>
                  {researchResult.samples.map((sample) => <a href={sample.url} target="_blank" rel="noreferrer" key={`${sample.source}-${sample.url}`}><span className="figma-marketplace-brand"><img src={sample.source === "Rakuten" ? "/brands/rakuten.ico" : "/brands/mercari.ico"} alt="" /><span className="sr-only">{sample.source}</span></span><p>{sample.title}</p><b>{formatYen(sample.price)}</b></a>)}
                </div>
              </details>

              <div className="figma-agent-warning"><span>i</span><p>Physical-store suggestions indicate suitable areas to search. They do not confirm real-time inventory; check with the store before visiting.</p></div>
            </section>
            <form className="figma-followup-composer" data-node-id="10:98" onSubmit={(event) => event.preventDefault()}>
              <textarea rows={1} aria-label="Describe another collectible" placeholder="Upload a photo or describe what you’re looking for" />
              <div className="figma-followup-actions" data-node-id="10:100">
                <button className="figma-followup-add" type="button" aria-label="Add an image or file"><img src="/figma/composer-add.svg" alt="" /></button>
                <div className="figma-followup-actions-right" data-node-id="10:102">
                  <button className="figma-followup-microphone" type="button" aria-label="Use microphone"><img src="/figma/composer-microphone.svg" alt="" /></button>
                  <button className="figma-followup-submit" type="submit" aria-label="Send"><img src="/figma/composer-submit-active.svg" alt="" /></button>
                </div>
              </div>
            </form>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
