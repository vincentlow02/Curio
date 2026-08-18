# Curio

> This is the detailed developer and deployment guide. Start with the [portfolio overview](../README.md) or the [architecture guide](../docs/ARCHITECTURE.md).

Curio is a web-based collectible research agent for people shopping in Tokyo. Upload a photo or describe an item, confirm the identification, and Curio produces a sourced online asking-price reference plus Tokyo areas worth checking.

**Live demo:** add the verified Vercel URL after the first production deployment.

**Demo access code:** `agentforge`

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

If the category cannot be identified reliably, the identification response returns `needs_review` instead of inventing a classification.

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
src/features/analysis/       Responsive UI, stream handling, recent history
src/core/profile/            Detection types and validation
src/core/price/              Deterministic calculation and matching
src/core/recommendation/     Tokyo area recommendations
src/server/analysis/         Detect and research orchestration
src/server/providers/        Qwen, marketplaces, Tavily, auctions, Daytona
src/server/browser/          Local and Browserless browser provider
src/server/security/         Access code and upload checks
src/price/                   Reusable price-spike implementation
tests/                       Unit and integration tests
```

Production requests are stateless. Recent history is device-local: up to 12 records are stored in `localStorage`, while image previews are stored in IndexedDB. No database is required for the demo.

## Local setup

Requirements:

- Node.js 20 or newer
- npm
- Chromium installed through Playwright

```powershell
cd Tokyo-Collectible-Research-Agent
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

### Optional website analytics

Set either or both public IDs in `.env.local`, then restart the app:

```dotenv
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_CLARITY_PROJECT_ID=your-clarity-project-id
```

GA4 records page visits and approximate visitor country. A successful, manually
entered demo access code also sends the recommended GA4 `login` event with
`method=demo_access_code`. Clarity receives a matching `login` custom event for
filtering recordings. Access codes and other personally identifiable information
are never sent. Stored access-code revalidation after a page refresh is not counted
as another login.

Core live configuration:

```dotenv
WEB_USE_FIXTURE=false
DEMO_ACCESS_CODE=

QWEN_API_KEY=
QWEN_BASE_URL=https://your-workspace-id.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
QWEN_VISION_MODEL=qwen3-vl-plus
QWEN_TEXT_MODEL=

PLAYWRIGHT_HEADLESS=true
BROWSER_PROVIDER=browserless
BROWSERLESS_WS_ENDPOINT=wss://production-sfo.browserless.io
BROWSERLESS_API_TOKEN=
BROWSER_SESSION_TIMEOUT_SECONDS=55
RESEARCH_TIME_BUDGET_SECONDS=240

ENABLE_DAYTONA_PROCESSING=true
DAYTONA_API_KEY=
DAYTONA_API_URL=https://app.daytona.io/api

ENABLE_TAVILY_PRICE_FALLBACK=true
TAVILY_API_KEY=
```

All remaining limits and timeouts are documented in `.env.example`.

Keys that have appeared in chat, screenshots, logs, or shared documents must be revoked before deployment.

## Stateless API model

- `POST /api/analysis` — validates multipart `image`, `text`, and optional `category`, then returns Qwen identification synchronously.
- `POST /api/analysis/{runId}/research` — streams NDJSON stages and the final result using the user-confirmed identification.
- `POST /api/access` — validates the server-side demo access code.
- `GET /api/health` — reports safe provider and Browserless readiness.

Protected requests send the code through `X-Demo-Code`. The browser keeps it only in `sessionStorage`.

Uploads support JPG, JPEG, PNG, and WEBP. The browser reduces large images below 4 MB before upload, and text descriptions are limited to 2,000 characters. The server still bounds the multipart request and validates the image signature.

## Deterministic pricing and Daytona

Node.js is the authoritative calculation layer. It performs listing matching, deduplication, condition handling, median absolute deviation filtering, and Low/Typical/High aggregation.

When enabled, Daytona receives only the normalized calculation input. Its isolated TypeScript sandbox independently recalculates the decisions and range:

- It does not browse the web.
- It receives no Qwen, Tavily, Rakuten, or Mercari credentials.
- It cannot replace or mutate the Node result.
- A failure or mismatch keeps the Node result and adds a warning.
- The temporary sandbox is deleted immediately after verification; the configured auto-delete interval remains a cleanup fallback.
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

## Vercel deployment

The primary portfolio deployment uses Vercel Hobby and Browserless. The Docker and Railway files remain available for optional self-hosting.

1. Import the GitHub repository into a personal Vercel Hobby project and enable Fluid Compute.
2. Add all secrets through Vercel Environment Variables and set `BROWSER_PROVIDER=browserless`.
3. Confirm the research Function shows the current 300-second maximum before publishing; the application uses a 240-second internal budget.
4. Confirm `WEB_USE_FIXTURE=false` and run the complete image, confirmation, and research workflow.
5. Check the Browserless dashboard after the first ten runs and record the measured unit usage.

The deployment does not require Supabase, another database, or a persistent volume.

## Security and limitations

- API keys stay server-side and error responses are sanitized.
- A demo access code and upload limit control casual public use; provider dashboard limits provide the hard cost boundary.
- Marketplace pages can change or present CAPTCHA; Curio returns partial results rather than bypassing protection.
- No automatic login, purchasing, bidding, pagination, or inventory claims are implemented.
- A missing source is shown as uncertainty instead of fabricated data.
- This is a hackathon MVP, not a professional valuation or authentication service.

## License

The source code is available under the repository's [MIT License](../LICENSE). Third-party services, marketplace content, trademarks, and visual assets remain subject to their own terms.
