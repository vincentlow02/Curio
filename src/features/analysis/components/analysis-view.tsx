import Link from "next/link";
import type { AnalysisSessionView } from "../../../core/analysis/types";

const stageLabels: Record<string, string> = {
  queued: "Queued", identifying: "Identifying item", searching_marketplaces: "Searching marketplaces", searching_auctions: "Checking active auctions", searching_fallback: "Checking fallback sources", processing_prices: "Processing prices", completed: "Complete", needs_review: "Needs review", failed: "Failed",
};

function yen(value: number | null): string { return value === null ? "—" : `¥${value.toLocaleString("ja-JP")}`; }

export function AnalysisView({ session }: { session: AnalysisSessionView }): React.ReactElement {
  const terminalError = session.status === "failed" || session.status === "needs_review";
  if (terminalError) return <section className="analysis-shell"><div className="error-panel"><span className="status-symbol">!</span><p className="eyebrow">{stageLabels[session.status]}</p><h1>{session.message}</h1><p>{session.error}</p><Link className="primary-button inline-button" href="/">Upload another photo <span>→</span></Link></div></section>;
  if (!session.result) return <section className="analysis-shell"><div className="progress-panel"><p className="eyebrow">ANALYSIS IN PROGRESS</p><h1>{session.message}</h1><p>{session.status === "queued" && session.queuePosition ? `Queue position: ${session.queuePosition}` : "This usually takes under 90 seconds."}</p><div className="progress-track"><span style={{ width: `${session.progress}%` }} /></div><div className="stage-row">{["identifying", "searching_marketplaces", "processing_prices"].map((stage) => <span key={stage} className={session.status === stage ? "active" : ""}>{stageLabels[stage]}</span>)}</div></div></section>;
  const result = session.result;
  const priceMissing = result.priceReference.sampleCount === 0;
  return <section className="analysis-shell result-shell">
    <div className="result-heading"><div><p className="eyebrow">ANALYSIS COMPLETE</p><h1>{result.identification.itemName}</h1><p>{result.identification.version} · {result.identification.category}</p></div><Link href="/" className="secondary-button">Analyze another</Link></div>
    <div className="result-grid">
      <article className="panel identity-panel"><span className="panel-index">01</span><h2>Identification</h2><dl><div><dt>Item</dt><dd>{result.identification.itemName}</dd></div><div><dt>Version</dt><dd>{result.identification.version}</dd></div><div><dt>Search keyword</dt><dd lang="ja">{result.identification.priceSearchKeywordJa}</dd></div><div><dt>Category</dt><dd>{result.identification.category}</dd></div></dl></article>
      <article className="panel price-panel"><span className="panel-index">02</span><h2>Asking-price reference</h2>{priceMissing ? <div className="empty-state"><b>Not enough comparable samples</b><p>Identification succeeded, but public listings were insufficient for a responsible range.</p></div> : <><div className="price-range"><div><span>Low</span><b>{yen(result.priceReference.low)}</b></div><div className="median"><span>Median</span><b>{yen(result.priceReference.median)}</b></div><div><span>High</span><b>{yen(result.priceReference.high)}</b></div></div><p className="sample-note">Based on {result.priceReference.sampleCount} comparable public listings · {result.priceReference.disclaimer}</p></>}</article>
      <article className="panel area-panel"><span className="panel-index">03</span><h2>Where to look in Tokyo</h2><div className="areas">{result.recommendedAreas.map((area) => <div key={area.area}><b>{area.area}</b><p>{area.reason}</p><code>{area.searchKeywordJa}</code></div>)}</div></article>
      <article className="panel evidence-panel"><span className="panel-index">04</span><h2>Evidence & cautions</h2>{result.storeSuggestions.length ? <ul>{result.storeSuggestions.map((store) => <li key={store.sourceUrl}><a href={store.sourceUrl} target="_blank" rel="noreferrer">{store.name}</a><p>{store.reason}</p></li>)}</ul> : <p>No specific physical store is shown without a verifiable source.</p>}<ul className="warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></article>
    </div>
    <details className="sample-details"><summary>View {result.priceReference.samples.length} price samples</summary><div className="sample-table">{result.priceReference.samples.map((sample) => <a key={sample.url} href={sample.url} target="_blank" rel="noreferrer"><span>{sample.source}</span><b>{sample.title}</b><strong>{yen(sample.price)}</strong></a>)}</div></details>
  </section>;
}
