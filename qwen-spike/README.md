# Curio

Curio is a web-based collectible research agent for people shopping in Tokyo. Upload a photo or describe an item, confirm the identification, and Curio produces a sourced online asking-price reference plus Tokyo areas worth checking.

**Live demo:** [curio-web-production.up.railway.app](https://curio-web-production.up.railway.app)

> Curio reports public asking-price references, not confirmed transaction prices, appraisals, authenticity guarantees, or real-time store inventory.

## Why Curio

General-purpose chatbots can provide plausible answers, but collectible research needs repeatable identity checks, real source links, explicit uncertainty, and deterministic calculations. Curio separates those responsibilities:

- Qwen Cloud identifies the collectible from an image or text and returns strict structured data.
- Playwright reads public Japanese marketplace pages using a Japanese search keyword.
- Node.js matches listings, removes duplicates, and calculates the price reference deterministically.
- Daytona independently recalculates the result in an isolated sandbox and reports whether it agrees with Node.js.
- Tavily is a strictly limited fallback only when Rakuten and Mercari produce no usable samples.

## Supported categories

- **Toys & Character Collectibles** — designer toys, figures, sofubi, and character merchandise.
- **Cards & Game Collectibles** — trading cards, retro games, handhelds, consoles, and limited gaming hardware.
- **Records & Music Collectibles** — vinyl, CDs, cassettes, posters, and music memorabilia.

If the category cannot be identified reliably, the session enters `needs_review` instead of inventing a classification.

## Runtime flow

```text
Image or text
  -> Qwen Detect
  -> editable item name, version, category, and Japanese search keyword
  -> Rakuten + Mercari public search pages
  -> Tavily basic fallback only when both primary sources have no valid samples
  -> deterministic Node.js matching and price calculation
  -> optional Daytona consistency verification
  -> sourced asking-price reference and Tokyo area suggestions
```

Qwen does not generate prices, store inventory, addresses, or marketplace listings. The UI exposes safe `Run details` showing provider status, call counts, candidate counts, token usage, Node calculation status, Daytona verification, and total duration.

## Collector Mode

Collector Mode adds visible edition and condition evidence without making a second Qwen call. During research it may read one public Yahoo! Auctions results page and one Mandarake Auction results page.

- Active auction signals remain separate from the Rakuten/Mercari price range.
- Current price, starting price, and buy-now price retain their original meanings.
- Auction prices are never presented as confirmed sale prices.
- Mandarake listings are specialist-source evidence, not automatic proof of authenticity.

## Architecture

```text
src/app/                     Next.js pages and API routes
src/features/analysis/       Responsive UI, session polling, Recent history
src/core/profile/            Detection types and validation
src/core/price/              Deterministic calculation and matching
src/core/recommendation/     Tokyo area recommendations
src/server/analysis/         Detect and research orchestration
src/server/providers/        Qwen, marketplaces, Tavily, auctions, Daytona
src/server/queue/            Single-worker bounded queue
src/server/sessions/         In-memory session lifecycle
src/server/security/         Access code, upload checks, rate limiting
src/price/                   Reusable price-spike implementation
tests/                       Unit and integration tests
```

The production deployment intentionally uses one Railway instance. Sessions live in memory for one hour and may disappear after a restart. Recent history is device-local: up to 12 records are stored in `localStorage`, while image previews are stored in IndexedDB. No database is required for the demo.

## Local setup

Requirements:

- Node.js 20 or newer
- npm
- Chromium installed through Playwright

```powershell
cd qwen-spike
npm install
npx playwright install chromium
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To develop without consuming provider credits:

```dotenv
WEB_USE_FIXTURE=true
DEMO_ACCESS_CODE=your-local-demo-code
```

For live mode, set `WEB_USE_FIXTURE=false` and configure the required server-side variables.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit `.env.local`, and never use the `NEXT_PUBLIC_` prefix for secrets.

Core live configuration:

```dotenv
WEB_USE_FIXTURE=false
DEMO_ACCESS_CODE=

QWEN_API_KEY=
QWEN_BASE_URL=https://your-workspace-id.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
QWEN_VISION_MODEL=qwen3-vl-plus
QWEN_TEXT_MODEL=

PLAYWRIGHT_HEADLESS=true

ENABLE_DAYTONA_PROCESSING=true
DAYTONA_API_KEY=
DAYTONA_API_URL=https://app.daytona.io/api

ENABLE_TAVILY_PRICE_FALLBACK=true
TAVILY_API_KEY=
```

All remaining limits and timeouts are documented in `.env.example`.

Keys that have appeared in chat, screenshots, logs, or shared documents must be revoked before deployment.

## API and session model

- `POST /api/analysis` — creates the Detect task from multipart `image`, `text`, and optional `category`.
- `GET /api/analysis/{sessionId}` — returns a safe public session view for polling.
- `POST /api/analysis/{sessionId}/research` — starts research once using the user-confirmed identification.
- `GET /api/health` — reports safe provider readiness for Railway health checks.

Protected requests send the demo code through `X-Demo-Code`. The browser keeps it only in `sessionStorage`; it is never written to a URL or bundled into client JavaScript.

Uploads support JPG, JPEG, PNG, and WEBP up to 10 MB. The server deletes the temporary image after Qwen identification.

## Deterministic pricing and Daytona

Node.js is the authoritative calculation layer. It performs listing matching, deduplication, condition handling, median absolute deviation filtering, and Low/Typical/High aggregation.

When enabled, Daytona receives only the normalized calculation input. Its isolated TypeScript sandbox independently recalculates the decisions and range:

- It does not browse the web.
- It receives no Qwen, Tavily, Rakuten, or Mercari credentials.
- It cannot replace or mutate the Node result.
- A failure or mismatch keeps the Node result and adds a warning.
- Daytona verification adds no LLM tokens.

Use a synthetic local input to verify the Daytona connection:

```powershell
npm run daytona-smoke
```

This command creates a real sandbox and should not run automatically in CI.

## Technical spike commands

Image identification:

```powershell
npm run analyze -- ./test-data/sample-item.jpg
```

Offline price fixture:

```powershell
npm run price-reference -- --fixture --input ./fixtures/price-reference/input.json
```

Live public marketplace research:

```powershell
npm run price-reference -- --live --input ./output/item-profile.json
```

Replay an existing snapshot without browsing again:

```powershell
npm run price-reference -- --replay <runId>
```

Generated output and local runtime snapshots are ignored by Git.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

Fixture tests do not call Qwen, Tavily, Daytona, marketplaces, or other network services.

## Railway deployment

The repository includes a Playwright-based `Dockerfile` and `railway.json`.

1. Create a Railway service from the GitHub repository.
2. Set the service root directory to `/qwen-spike`.
3. Add all secrets using Railway Variables.
4. Keep a single replica because the queue and sessions are in memory.
5. Use `/api/health` as the health-check path.
6. Confirm `WEB_USE_FIXTURE=false` for the public demo.

The deployment does not require Supabase, another database, or a persistent volume.

## Security and limitations

- API keys stay server-side and error responses are sanitized.
- A demo access code, per-IP rate limit, upload limit, and bounded queue control public use.
- Marketplace pages can change or present CAPTCHA; Curio returns partial results rather than bypassing protection.
- No automatic login, purchasing, bidding, pagination, or inventory claims are implemented.
- A missing source is shown as uncertainty instead of fabricated data.
- This is a hackathon MVP, not a professional valuation or authentication service.

## License

This repository is currently provided as a hackathon demonstration project. No separate open-source license has been declared.
