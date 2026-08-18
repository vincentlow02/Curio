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
       ├─ access-code and upload validation
       ├─ Qwen identification
       └─ stateless research workflow
            ├─ Browser provider
            │    ├─ local: Chromium
            │    └─ Vercel: Browserless over CDP
            ├─ deterministic Node.js price calculation
            ├─ optional Tavily fallback
            └─ optional Daytona verification
```

There is no database, message broker, server-side session store, or production browser binary in Vercel.

## Request flow

1. `POST /api/analysis` validates the access code, text and optional image. Images are bounded to 4 MB after client-side compression. Qwen returns a structured identity and optional Collector Mode evidence in the same request.
2. The user reviews and can edit the identity.
3. `POST /api/analysis/{runId}/research` receives the confirmed identity and emits NDJSON stage events until it returns the result.
4. One browser lease creates one context. Rakuten and Mercari use separate pages; Collector Mode adds separate Yahoo! Auctions and Mandarake pages. All requested primary pages run concurrently through `Promise.allSettled()`.
5. A source failure becomes a source-specific status. Other completed sources remain usable.
6. The TypeScript matcher applies identity, condition, duplicate and outlier rules. Qwen never calculates the price.
7. Tavily runs only when the primary sources produce no valid sample. Its result pages use a second short browser lease only when required.
8. Daytona can independently verify the normalized calculation. Failure or mismatch never replaces the Node.js result.

## Browser lifecycle

`src/server/browser/browser-provider.ts` is the only infrastructure-aware browser module.

- Local mode calls `chromium.launch()`.
- Browserless mode calls `chromium.connectOverCDP()`.
- Vercel refuses to fall back to local Chromium.
- A lease is limited to 55 seconds and its idempotent `close()` closes the context and connection.
- Marketplace parsers receive a `BrowserContext`; they do not choose or launch browser infrastructure.

Browserless Free currently bills one unit for each block of up to 30 seconds per browser connection. A primary research uses one connection regardless of whether it opens two or four pages. The expected one-to-two-unit cost is a planning estimate that must be checked against the first ten live runs.

## Time budget

The research route declares a 300-second Vercel maximum, matching the current Hobby Fluid Compute limit. The application uses a separate 240-second internal deadline so cleanup and error serialization do not run at the platform boundary. Before publishing a deployment, the effective Function duration must be verified in Vercel because plan limits can change.

Optional work is skipped safely when the remaining budget is insufficient:

- primary browser lease: at most 55 seconds;
- Tavily fallback: only when at least 80 seconds remain;
- Daytona: only when at least 75 seconds remain;
- final calculation and response retain their own margin.

## State and trust boundaries

- Recent metadata uses `localStorage`; recent images use IndexedDB; the access code uses `sessionStorage`.
- Provider keys remain in server-side environment variables.
- Qwen output and user-edited identification are validated before research.
- Marketplace content is untrusted and filtered before aggregation.
- Raw provider errors are redacted from public responses.
- Process-local request limiting is best-effort on Vercel. Hard cost protection belongs in provider dashboards.

## Failure behavior

- Uncertain identification returns `needs_review`.
- Each marketplace reports its own failure without rejecting the whole primary research phase.
- A dropped research stream can be retried with the already confirmed identity.
- Tavily and Daytona failures preserve deterministic Node.js output.
- Browserless configuration errors are reported explicitly; Vercel never attempts a local browser launch.
- Browserless quota exhaustion makes live collection unavailable until the quota resets, but fixture mode remains usable.

## Why this shape fits the demo

The application is intended for occasional portfolio review, not high concurrency. Stateless requests work with Vercel Hobby, while one remote browser connection keeps Browserless usage small. This preserves the real parsers and pricing logic without operating a VM, database, Redis instance, or browser container.
