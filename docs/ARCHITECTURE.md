# Curio architecture

Curio is a stateless Next.js application. Vercel runs the interface and API routes; Browserless runs production Chromium. Local development uses the same browser-provider interface with local Chromium.

```text
User browser
  ├─ Next.js interface
  │    ├─ upload or text input
  │    ├─ identity review
  │    ├─ streamed research stages
  │    └─ result and local history
  │
  └─ Next.js API routes on Vercel
       ├─ request limits and upload validation
       ├─ Qwen identification
       └─ stateless research workflow
            ├─ Browser provider
            │    ├─ local: Chromium
            │    └─ Vercel: Browserless over CDP
            ├─ deterministic Node.js price calculation
            └─ optional Tavily fallback
```

There is no database, message broker, server-side session store, or production browser binary in Vercel.

## Frontend boundaries

- `src/app/page.tsx` mounts `AnalysisWorkspace`.
- `analysis-workspace.tsx` owns sidebar and locale settings, and coordinates new runs and history selection.
- `analysis-run.tsx` composes a single run, previews, history-save integration, and the four Stage components. The Stages are currently flat files in `features/analysis/components/`, not separate nested component libraries.
- `use-analysis-run.ts` orchestrates API calls; `analysis-run-reducer.ts` initializes state and defines transitions. `isBusy` is derived from Phase rather than maintained as a second independent workflow flag.
- `use-research-stream.ts` delegates decoding and runtime event validation to `services/research-stream.ts`.
- `use-analysis-history.ts` manages history selection; `history-service.ts` wraps metadata persistence and the IndexedDB image adapter.
- `lib/analysis-run-lifecycle.ts` invalidates stale executions, rejects duplicate active research, and aborts client requests when the run is disposed. This does not guarantee immediate cancellation of server-side provider work.
- Shared contracts live in `core/analysis/types.ts` and `core/profile/types.ts`; feature input/history types live in `features/analysis/types.ts`, and pricing contracts in `price/types.ts`.

## Request flow

1. `POST /api/analysis` validates the text and optional image. Images are bounded to 4 MB after client-side compression. Qwen returns a structured identity and optional Collector Mode evidence in the same request.
2. The user reviews and can edit the identity.
3. `POST /api/analysis/{runId}/research` receives the confirmed identity and emits NDJSON stage events until it returns the result.
4. One browser lease creates one context. Rakuten and Mercari use separate pages; Collector Mode adds separate Yahoo! Auctions and Mandarake pages. All requested primary pages run concurrently through `Promise.allSettled()`.
5. A source failure becomes a source-specific status. Other completed sources remain usable.
6. The TypeScript matcher applies identity, condition, duplicate and outlier rules. Qwen never calculates the price.
7. Tavily runs only when the primary sources produce no valid sample. Its result pages use a second short browser lease only when required.
8. Node.js maps the reference range, source samples, auction evidence, warnings, and category-based Tokyo area suggestions into the shared `AnalysisResult` contract. The route emits a terminal NDJSON result event. No external calculation sandbox is used.

## Browser lifecycle

`src/server/browser/browser-provider.ts` is the only infrastructure-aware browser module.

- Local mode calls `chromium.launch()`.
- Browserless mode calls `chromium.connectOverCDP()`.
- Vercel refuses to fall back to local Chromium.
- A lease is limited to 55 seconds and its idempotent `close()` closes the context and connection.
- Marketplace parsers receive a `BrowserContext`; they do not choose or launch browser infrastructure.

A primary research uses one browser connection regardless of whether it opens two or four pages. Fallback collection may open a second connection. Provider-side quotas and measured usage, not process-local request counts alone, must be used to control cost.

## Time budget

The research route declares a 300-second maximum. The application uses a separate internal deadline with a 240-second default and cap. The effective deployment timeout still needs to be verified in Vercel; the source configuration does not guarantee that a platform or plan permits that duration.

Optional work is skipped safely when the remaining budget is insufficient:

- primary browser lease: at most 55 seconds;
- Tavily fallback: only when at least 80 seconds remain;
- final calculation and response retain their own margin.

## State and trust boundaries

- Recent metadata uses `localStorage`; recent images use IndexedDB.
- Provider keys remain in server-side environment variables.
- Qwen output and user-edited identification are validated before research.
- Marketplace content is untrusted and filtered before aggregation.
- Raw provider errors are redacted from public responses.
- Process-local request limiting is best-effort on Vercel. Hard cost protection belongs in provider dashboards.
- Recognition and research both consume the existing shared request quota. Direct research calls are limited too; a complete analysis normally uses two requests. The run ID is a correlation identifier, not an authorization token.
- Restoring completed history does not call providers. Interrupted research with a saved identity returns to confirmation and restarts only when the user explicitly continues; interrupted recognition without an identity displays an error instead of permanent loading.

## Failure behavior

- Uncertain identification returns `needs_review`.
- Each marketplace reports its own failure without rejecting the whole primary research phase.
- An interrupted history record with a saved identity returns to confirmation. Research restarts only after an explicit user action; records without an identity show an error instead of indefinite loading.
- Tavily failure is reported without fabricating marketplace evidence or prices.
- Browserless configuration errors are reported explicitly; Vercel never attempts a local browser launch.
- Browserless quota exhaustion makes live collection unavailable until the quota resets, but fixture mode remains usable. Fixture mode returns fixed identification and result data; it is not a live-provider or matcher E2E verification.

## Why this shape fits the demo

The application is intended for occasional portfolio review, not high concurrency. Stateless requests work with Vercel Hobby, while one remote browser connection keeps Browserless usage small. This preserves the real parsers and pricing logic without operating a VM, database, Redis instance, or browser container.
