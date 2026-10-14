# Curio architecture

Curio is a stateless Next.js application designed for deployment on Vercel with Browserless providing remote Chromium. Local development can use the same browser-provider interface with local Chromium.

This document describes the current checked-out implementation, including its limitations. It does not certify the deployed version, live provider availability, or measured usage costs.

```text
User browser
  ├─ Next.js interface
  │    ├─ upload or text input
  │    ├─ identity review
  │    ├─ streamed research stages
  │    └─ result and local history
  │
  └─ Next.js API routes on Vercel
       ├─ recognition request limits and upload validation
       ├─ Qwen identification
       └─ stateless research workflow
            ├─ Browser provider
            │    ├─ local: Chromium
            │    └─ Vercel: Browserless over CDP
            ├─ deterministic Node.js price calculation
            └─ optional Tavily fallback using the shared lazy browser lease
```

The application workflow does not use a database, message broker, or persistent server-side session store. The Vercel browser-provider path connects remotely instead of launching a local browser binary.

## Request flow

1. `POST /api/analysis` applies the process-local demo quota and validates the text and optional image. The client attempts to compress images larger than 4 MB; the server independently enforces its configured upload limit, MIME type, and image signature. Qwen returns a structured identity and optional Collector Mode evidence in the same request.
2. The user reviews and can edit the identity.
3. `POST /api/analysis/{runId}/research` validates the confirmed identity and emits NDJSON `stage`, `completed`, or `error` events. The browser requires a valid `completed` event rather than treating an HTTP 200 or end-of-stream as success.
4. The Marketplace selector chooses enabled providers from the registry using the confirmed item profile. Rakuten uses the official Item Search API only when `RAKUTEN_OFFICIAL_API_ENABLED=true`; otherwise the preserved Rakuten Browser Provider remains selected. HTTP providers run without a Browser lease; Browser-backed providers share one lazy lease.
5. Each Marketplace provider owns its request and parsing logic. A source failure becomes a source-specific status, while other completed sources remain usable.
6. Providers return the shared `SearchSnapshot` candidate contract. The TypeScript matcher applies product-type, identity, condition, duplicate, and outlier rules. Qwen never calculates the price.
7. Disabled providers are not queried. A Rakuten API failure is reported and does not silently start the Browser implementation; the feature flag explicitly chooses the implementation.
8. Tavily runs only when primary providers produce no valid sample. If fallback pages need inspection, it reuses the workflow's lazy Browser context.
9. Node.js produces the authoritative reference range. Daytona is not called by the current workflow.

Implementation: `src/app/api/analysis/route.ts::POST`, `src/app/api/analysis/[sessionId]/research/route.ts::POST`, `src/server/analysis/run-pipeline.ts::researchCollectible`, and `src/price/matcher.ts::buildPriceResult`.

## Browser lifecycle

`src/server/browser/browser-provider.ts` centralizes browser launching and remote connections. The research workflow owns one lazy lease accessor and closes the lease on completion, failure, cancellation, or deadline. HTTP Marketplace providers do not depend on Playwright.

- Local mode calls `chromium.launch()`.
- Browserless mode calls `chromium.connectOverCDP()`.
- Vercel refuses to fall back to local Chromium.
- A lease schedules cleanup after 55 seconds by default; `BROWSER_SESSION_TIMEOUT_SECONDS` can override the setting. Its idempotent `close()` closes the context and connection.
- Browser Marketplace providers receive a `BrowserContext`; shared browser-search helpers create and close their pages. HTTP Marketplace providers have no Browser context in their contract.
- `src/server/providers/marketplaces/registry.ts` lists enabled and disabled marketplace registrations. `selector.ts` filters enabled providers, and `coordinator.ts` returns the existing `SearchSnapshot` contract.
- `src/server/providers/marketplaces/rakuten-api-client.ts` performs the server-only Rakuten API request. `rakuten.ts` maps V2 items into the existing candidate contract; `rakuten-browser.ts` retains the previous DOM scraper for explicit rollback. The API flag defaults off, and credentials are read only in server modules.
- Rakuten requests are serialized to at most one per second inside one Node.js process, with no automatic retry and `Retry-After` cooldown after 429. This does not enforce the limit across serverless instances; API production activation remains blocked until cross-instance rate limiting and usage permission are confirmed.
- Collector Auctions use the same lazy lease. Tavily result inspection uses it only if usable result pages are returned. Store verification is currently disabled in the research workflow; its standalone helper still owns a separate lease if called directly.

[Browserless documents](https://docs.browserless.io/overview/unit-consumption) browser-time billing in 30-second increments, rounded up. Browser-backed Marketplace, Collector, and Tavily inspection pages reuse at most one workflow connection. Built-in proxies and CAPTCHA solving can add charges; actual dashboard consumption still needs measurement.

## Time budget

The research route declares `maxDuration = 300`. [Vercel currently documents](https://vercel.com/docs/functions/limitations) a 300-second Hobby Fluid Compute maximum, including time spent streaming the response. Verify Fluid Compute and the effective Function configuration before publishing; a source declaration alone does not prove the deployed limit.

`createResearchDeadline()` uses a configurable budget defaulting to, and capped at, 240 seconds. This leaves a platform margin below the declared 300-second route duration.

- Primary browser cleanup is scheduled using the lease timeout, defaulting to 55 seconds.
- Tavily is gated by `deadline.has(80_000)`, which requires more than 80 seconds remaining. Its search request has a separate 30-second timeout, and page inspection reuses the workflow lease.
- The deadline signal is combined with the request signal and passed to Marketplace HTTP providers and Tavily. Cancellation also closes the shared browser lease.
- The research route propagates client disconnect and stream cancellation through the workflow abort signal.
- Daytona is not part of the current workflow. Final synchronous calculation and response serialization rely on the gap between the 240-second internal deadline and the 300-second route declaration rather than a second timer.

Implementation: `src/server/analysis/research-deadline.ts::createResearchDeadline`, `src/server/config/env.ts`, and `src/server/analysis/run-pipeline.ts::researchCollectible`.

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
- Marketplace provider failures normally become source-specific failures, allowing other successful sources to contribute. A shared browser connection failure can affect every Browser-backed provider while HTTP providers remain independent.
- A dropped or invalid research stream enters the frontend error state. Persisted interrupted history with a confirmed identity restores to confirmation and restarts research only after explicit user action; the current error screen does not expose a same-turn research-only retry.
- Tavily HTTP failures are returned as an unsuccessful fallback snapshot. Failure to open the shared browser lease for result inspection can still reject the research workflow.
- Daytona does not participate in current failure handling because it is not invoked.
- The browser provider throws on missing Browserless configuration or a local launch attempt on Vercel. The pipeline may expose these through a generic public failure message rather than the original configuration error.
- Browserless quota exhaustion prevents remote collection while the account cannot accept sessions. The result can be empty or the workflow can fail depending on the fallback path; zero listings are not fabricated into a successful price range.
- Fixture mode bypasses live providers when explicitly enabled. It is not an automatic fallback and does not demonstrate real API success.

## Why this shape fits the demo

This structure is suitable for occasional portfolio review: stateless API requests avoid maintaining a server-side session service, and primary searches share one remote browser connection. The real parsers and deterministic pricing logic can run without operating a VM, database, Redis instance, or browser container for this workflow.

This is a design fit, not a verified capacity or deployment claim. Cross-instance cost limiting, same-turn research-only retry, provider-page drift, and comprehensive warning redaction remain limitations of the current implementation.
