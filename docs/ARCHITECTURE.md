# Curio architecture

This document explains the running system without assuming prior knowledge of the codebase.

## System overview

Curio is one Next.js application. The browser renders the interface and calls API routes in the same deployment. The server coordinates identification, marketplace collection, deterministic price calculation, and optional verification.

```text
User browser
  │
  ├─ Next.js interface
  │    ├─ upload or text input
  │    ├─ identity review
  │    ├─ progress polling
  │    └─ result and source links
  │
  └─ Next.js API routes
       ├─ access-code validation
       ├─ bounded analysis queue
       ├─ in-memory session store
       └─ analysis pipeline
            ├─ Qwen identification
            ├─ Playwright marketplace collection
            ├─ Node.js matching and price calculation
            ├─ optional Tavily fallback
            └─ optional Daytona verification
```

There is no database, message broker, separate backend service, or separate frontend deployment.

## Request flow

### 1. Input and validation

The browser submits an image or text description to `POST /api/analysis`. The API checks the demo access code and process-local usage limits, bounds the multipart body, validates file type and signature, limits text length, and creates a session.

### 2. Identification

The bounded queue starts `runDetection`. Qwen receives either the image or the text and must return a structured identity. If the result is incomplete or uncertain, the session becomes `needs_review` instead of inventing details. Uploaded images are deleted after this stage.

### 3. User confirmation

The frontend polls `GET /api/analysis/{sessionId}`. When identification succeeds, it shows editable identity fields. Research starts only after the user confirms them through `POST /api/analysis/{sessionId}/research`.

### 4. Marketplace research

Playwright reads public Rakuten and Mercari search pages using the Japanese keyword. Collector Mode can also inspect limited Yahoo! Auctions and Mandarake Auction results. Auction signals remain separate from the reference range.

### 5. Deterministic calculation

`src/price/matcher.ts` rejects non-comparable listings with recorded reasons. Examples include sold-out listings, broken items, accessories, bundles, duplicates, wrong models, and unconfirmed Pokémon Card identities. It then calculates the reference range from accepted samples and removes extreme prices using median absolute deviation.

### 6. Fallback and verification

Tavily is called only when the primary marketplaces return no valid price sample. Daytona can independently recalculate the normalized result. A Daytona failure does not replace the Node.js result; it adds a warning.

### 7. Result

The frontend displays the identified item, price range, samples, source URLs, Tokyo areas, warnings, provider activity, token use, and total duration.

## Component responsibilities

| Component | Responsibility | Does not do |
| --- | --- | --- |
| `src/features/analysis` | UI state, polling, localization, and device-local recent history | Provider calls or price calculation |
| `src/app/api` | HTTP validation and safe public responses | Marketplace parsing rules |
| `src/server/analysis` | Coordinates stages and records provider activity | Decide listing comparability directly |
| `src/server/providers/qwen` | Image/text identification into a strict contract | Generate prices or store inventory |
| `src/price` | Marketplace capture, matching, exclusions, and range calculation | User-interface rendering |
| `src/daytona` | Independent calculation consistency check | Override the authoritative Node.js result |
| `src/server/sessions` | Temporary session state and uploaded-file lifecycle | Durable storage |
| `src/server/queue` | Bounds concurrent analysis work | Distributed job processing |
| `src/server/security` | Access gate, upload checks, request limits, and error redaction | Full user authentication |

## State and persistence

- **Server:** sessions are stored in a global in-memory map and persisted temporarily under `.tmp/sessions` for the running instance.
- **Browser:** recent result metadata uses `localStorage`; recent images use IndexedDB; the demo access code stays in `sessionStorage`.
- **Production:** one Railway replica is intentional because the queue and session map are process-local.

## Trust boundaries

- Provider keys and the demo access code are server-side environment variables.
- The browser receives sanitized errors rather than raw provider responses.
- Qwen output is parsed and validated before entering the pricing pipeline.
- Marketplace content is treated as untrusted input and filtered before aggregation.
- Daytona receives normalized calculation data, not Qwen, Tavily, Rakuten, or Mercari credentials.
- Client-visible source links use the marketplace URLs collected by the server.

## Failure behavior

- Uncertain identification becomes `needs_review`.
- A failed marketplace can coexist with results from another source.
- Tavily runs only after zero valid primary samples.
- A failed or mismatched Daytona run leaves the Node.js result in place and adds a warning.
- Full queues reject new work instead of starting unlimited concurrent browser jobs.
- Per-client hourly and whole-demo daily limits reject excess public requests before paid provider work starts.
- Expired sessions return a clear error and temporary uploads are cleaned up.

## Why the current shape fits the demo

One deployable application keeps setup and operational cost low. The queue prevents a burst of expensive provider and browser work. Deterministic calculation and source links make the result explainable. The cost of this simplicity is process-local state, a single replica, and limited recovery after restarts.

The first architectural change for a production version should be durable session storage plus an external job queue. That would make multiple replicas and retryable jobs possible without changing the identification and price-calculation contracts.
