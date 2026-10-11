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
            ├─ optional Tavily fallback
            └─ optional Daytona verification
```

There is no database, message broker, server-side session store, or production browser binary in Vercel.

## Request flow

1. `POST /api/analysis` validates the text and optional image. Images are bounded to 4 MB after client-side compression. Qwen returns a structured identity and optional Collector Mode evidence in the same request.
2. The user reviews and can edit the identity.
3. `POST /api/analysis/{runId}/research` receives the confirmed identity and emits NDJSON stage events until it returns the result.
4. The Marketplace selector chooses enabled providers from the registry using the confirmed item profile. Rakuten uses the official Item Search API only when `RAKUTEN_OFFICIAL_API_ENABLED=true`; otherwise the preserved Rakuten Browser Provider remains selected. HTTP providers run without a Browser lease; the research workflow opens one lease lazily only when a selected provider or Collector Mode needs a Browser. Rakuten Browser, Mercari, and Collector Auctions share that lease.
5. Each Marketplace provider owns its search URL and site-specific DOM parsing. Browser providers use shared helpers for page navigation, per-source errors, and cleanup; HTTP providers receive only keyword, limits, and an optional abort signal. A source failure becomes a source-specific status; other completed sources remain usable.
6. Enabled Marketplace providers return the existing `SearchSnapshot` and candidate shape. The TypeScript matcher applies identity, condition, duplicate and outlier rules, and the pricing path is unchanged. Qwen never calculates the price.
7. Other planned marketplaces are registered as disabled and are not queried. An API request failure is reported for Rakuten and never starts the Browser implementation as an automatic fallback; setting the feature flag to `false` explicitly selects the preserved Browser Provider.
8. Tavily runs only when the primary sources produce no valid sample. Its API search is HTTP-only; if result pages need inspection, it requests the workflow's shared Browser context lazily.
9. Daytona can independently verify the normalized calculation. Failure or mismatch never replaces the Node.js result.

## Browser lifecycle

`src/server/browser/browser-provider.ts` is the only infrastructure-aware browser module. The research workflow owns one lazy lease accessor and closes the lease on completion, failure, cancellation, or deadline. The Marketplace coordinator requests a context only for Browser-backed providers; HTTP providers do not depend on Playwright.

- Local mode calls `chromium.launch()`.
- Browserless mode calls `chromium.connectOverCDP()`.
- Vercel refuses to fall back to local Chromium.
- A lease is limited to 55 seconds and its idempotent `close()` closes the context and connection.
- Browser Marketplace providers receive a `BrowserContext`; shared browser-search helpers create and close their pages. HTTP Marketplace providers have no Browser context in their contract.
- `src/server/providers/marketplaces/registry.ts` lists enabled and disabled marketplace registrations. `selector.ts` filters enabled providers, and `coordinator.ts` returns the existing `SearchSnapshot` contract.
- `src/server/providers/marketplaces/rakuten-api-client.ts` performs the server-only Rakuten API request. `rakuten.ts` maps V2 items into the existing candidate contract; `rakuten-browser.ts` retains the previous DOM scraper for explicit rollback. The API flag defaults off, and credentials are read only in server modules.
- Rakuten requests are serialized to at most one per second inside one Node.js process, with no automatic retry and `Retry-After` cooldown after 429. This does not enforce the limit across serverless instances; API production activation remains blocked until cross-instance rate limiting and usage permission are confirmed.
- Collector Auctions use the same lazy lease. Tavily result inspection uses it only if usable result pages are returned. Store verification is currently disabled in the research workflow; its standalone helper still owns a separate lease if called directly.

Browserless Free currently bills one unit for each block of up to 30 seconds per browser connection. A primary research uses at most one shared connection for Marketplace and Collector pages; Tavily inspection reuses it rather than opening another connection. Actual usage still depends on whether a Browser-backed provider or fallback page inspection runs.

## Time budget

The research route declares a 300-second Vercel maximum, matching the current Hobby Fluid Compute limit. The application uses a separate 240-second internal deadline so cleanup and error serialization do not run at the platform boundary. Before publishing a deployment, the effective Function duration must be verified in Vercel because plan limits can change.

Optional work is skipped safely when the remaining budget is insufficient:

- primary browser lease: at most 55 seconds;
- Tavily fallback: only when at least 80 seconds remain;
- Daytona: only when at least 75 seconds remain;
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
- A dropped research stream can be retried with the already confirmed identity.
- Tavily and Daytona failures preserve deterministic Node.js output.
- Browserless configuration errors are reported explicitly; Vercel never attempts a local browser launch.
- Browserless quota exhaustion makes live collection unavailable until the quota resets, but fixture mode remains usable.

## Why this shape fits the demo

The application is intended for occasional portfolio review, not high concurrency. Stateless requests work with Vercel Hobby, while one remote browser connection keeps Browserless usage small. This preserves the real parsers and pricing logic without operating a VM, database, Redis instance, or browser container.
