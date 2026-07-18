"use client";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function UploadForm(): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [demoCode, setDemoCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setDemoCode(sessionStorage.getItem("collectible-demo-code") ?? ""); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function select(next: File | null): void {
    setError(null);
    if (!next) return;
    if (!ACCEPTED.has(next.type)) { setError("Unsupported image format. Choose JPG, PNG or WEBP."); return; }
    if (next.size > MAX_BYTES) { setError("The image is larger than 10 MB. Compress it and try again."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setPreview(URL.createObjectURL(next));
  }

  function drop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault(); setDragging(false); select(event.dataTransfer.files[0] ?? null);
  }

  async function submit(): Promise<void> {
    if (!demoCode.trim()) { setError("Enter the Demo Access Code."); return; }
    if (!file) { setError("Choose a collectible image first."); return; }
    setSubmitting(true); setError(null);
    sessionStorage.setItem("collectible-demo-code", demoCode.trim());
    const data = new FormData(); data.set("image", file);
    try {
      const response = await fetch("/api/analysis", { method: "POST", headers: { "X-Demo-Code": demoCode.trim() }, body: data });
      const body = await response.json() as { sessionId?: string; error?: string };
      if (!response.ok || !body.sessionId) throw new Error(body.error ?? "Unable to create the analysis session.");
      window.location.assign(`/analysis/${body.sessionId}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setSubmitting(false); }
  }

  return <section className="hero-grid">
    <div className="hero-copy"><p className="eyebrow">TOKYO COLLECTIBLE RESEARCH</p><h1>Know what it is.<br /><em>Know where to look.</em></h1><p className="lede">Upload one collectible photo. We identify it, compare public asking prices in Japan, and suggest Tokyo areas worth checking.</p><div className="category-list"><span>Designer toys & characters</span><span>Cards & games</span><span>Records & music</span></div></div>
    <div className="upload-card">
      <label className="field-label" htmlFor="demo-code">Demo access code</label>
      <input id="demo-code" className="text-input" type="password" value={demoCode} onChange={(event) => setDemoCode(event.target.value)} placeholder="Enter access code" autoComplete="off" />
      <div className={`drop-zone ${dragging ? "is-dragging" : ""} ${preview ? "has-preview" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") input.current?.click(); }}>
        <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => select(event.target.files?.[0] ?? null)} />
        {preview ? <><img src={preview} alt="Collectible preview" /><div className="preview-meta"><b>{file?.name}</b><span>Click or drop to replace</span></div></> : <><span className="upload-icon">↥</span><b>Drop your collectible photo here</b><span>or click to browse · JPG, PNG, WEBP · max 10 MB</span></>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? "Creating analysis…" : "Analyze collectible"}<span>→</span></button>
      <p className="privacy-note">The server copy is deleted after identification. A local browser copy is kept for Recent history.</p>
    </div>
  </section>;
}
