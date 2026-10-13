# Curio

> This is the detailed developer and deployment guide. Start with the [portfolio overview](../README.md) or the [architecture guide](../docs/ARCHITECTURE.md).

Curio is a web-based collectible research agent for people shopping in Tokyo. Upload a photo or describe an item, confirm the identification, and Curio produces a sourced online asking-price reference plus Tokyo areas worth checking.

**Live demo:** [https://foragent-testing.vercel.app/](https://foragent-testing.vercel.app/)

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
src/server/security/         Request limits and upload checks
src/price/                   Reusable price-spike implementation
tests/                       Unit and integration tests
```

Production requests are stateless. Recent history is device-local: up to 12 records are stored in `localStorage`, while image previews are stored in IndexedDB. No database is required for the demo.

### Marketplace cost metrics

Research runs emit structured `curio.marketplace.cost` JSON logs and append provider, session, and per-research summary records to `output/marketplace-cost/metrics.jsonl` when the runtime filesystem is writable. The summary records source requests, total metered HTTP requests, provider and total research latency, Matcher and pricing samples, unique sellers, incremental sample contributions, and failed or blocked responses. This is local, non-durable storage: it is not shared across instances and is not guaranteed to survive a serverless restart. There is no database-backed cumulative report. Browserless time units are estimated as one unit per started 30-second interval and allocated by Page count across Marketplace, Auction, and Tavily owners; a session with no attributed Pages is recorded as `Unattributed`.

Run the report against the records actually present in that file:

```powershell
npm run marketplace-cost-report
npm run marketplace-cost-report -- ./path/to/metrics.jsonl
```

The command reports `NO_RECORDED_DATA` when no records exist; it does not seed sample data. `BROWSERLESS_COST_PER_TIME_UNIT_USD` is used only when `BROWSERLESS_COST_RATE_VERIFIED=true`. HTTP rates use `MARKETPLACE_HTTP_COST_RATES_JSON`, keyed by Marketplace ID, with an explicit verified rate, for example `{"Rakuten":{"usdPerRequest":0.01,"verified":true}}`. Missing or unverified rates produce UNKNOWN estimated cost. Browserless billing is never reported as actual without a supplied billable amount; Proxy/CAPTCHA units remain null until measured. Yahoo seller selection reads prior incremental valid-sample contributions from the same local metrics file and falls back to configured store order when history is unavailable.

Yahoo! Shopping's optimized mode makes one all-site used-listing request and stops seller requests when the Matcher reaches its configured reference-sample target. `YAHOO_SHOPPING_TARGET_PRICING_SAMPLES` defaults to 5 (the current per-source pricing cap), and `YAHOO_SHOPPING_MAX_SELLER_SEARCHES` defaults to 2. In non-production development, set `YAHOO_SHOPPING_SEARCH_MODE=all-relevant` to search every profile-relevant enabled store for provider testing; production ignores this override. The existing Janpara switch remains independently default-off.

Rakuten Ichiba Item Search API `2026-07-01` support is already implemented behind `RAKUTEN_OFFICIAL_API_ENABLED`. To opt in after credentials and the intended API use are authorized, configure `RAKUTEN_APPLICATION_ID`, `RAKUTEN_ACCESS_KEY`, and `RAKUTEN_OFFICIAL_API_ENABLED=true`; otherwise the Registry keeps the Browser rollback provider selected. The access key is sent in the `accessKey` header, not the URL. The fixture tests verify request shape and mapping, not live credentials or API authorization.

Yahoo!フリマ uses one ordinary HTML search GET and parses `__NEXT_DATA__`, with a query-bound HTML parser fallback over that same response. The exact `pageProps.searchResults` JSON shape and `data-testid` HTML selectors are fixture-only assumptions; they have not been checked against a live page. The provider remains disabled unless `YAHOO_FURIMA_DATA_LICENSE_VERIFIED=true`; set this only after applicable data-use authorization is verified. Actual Yahoo!フリマ access and commercial reuse authorization are unverified.

## Local setup

Requirements:

- Node.js 20 or newer
- npm
- Chromium installed through Playwright

```powershell
cd Curio
npm install
npx playwright install chromium
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To develop without consuming provider credits:

```dotenv
WEB_USE_FIXTURE=true
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

GA4 records page visits and approximate visitor country.

Core live configuration:

```dotenv
WEB_USE_FIXTURE=false

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

ENABLE_TAVILY_PRICE_FALLBACK=true
TAVILY_API_KEY=
```

`BROWSER_PROVIDER=local` uses locally installed Playwright Chromium and is unavailable on Vercel. `BROWSER_PROVIDER=browserless` uses Playwright CDP with `BROWSERLESS_WS_ENDPOINT`; this can point to Browserless Cloud, a self-hosted Browserless instance, or another reachable Chromium CDP endpoint. `BROWSERLESS_API_TOKEN` is appended as a `token` query parameter when non-empty and may be left blank when the endpoint does not require it. Keep Browserless Cloud's existing endpoint and token configuration unchanged when using that service.

All remaining limits and timeouts are documented in `.env.example`.

Keys that have appeared in chat, screenshots, logs, or shared documents must be revoked before deployment.

## Stateless API model

- `POST /api/analysis` — validates multipart `image`, `text`, and optional `category`, then returns Qwen identification synchronously.
- `POST /api/analysis/{runId}/research` — streams NDJSON stages and the final result using the user-confirmed identification.
- `GET /api/health` — reports safe provider and Browserless readiness.

Uploads support JPG, JPEG, PNG, and WEBP. The browser reduces large images below 4 MB before upload, and text descriptions are limited to 2,000 characters. The server still bounds the multipart request and validates the image signature.

## Deterministic pricing

Node.js is the authoritative calculation layer. It performs listing matching, deduplication, condition handling, median absolute deviation filtering, and Low/Typical/High aggregation.

The same Node.js calculation produces the Low/Typical/High range and excludes outliers using the median absolute deviation (MAD) rule. Marketplace collection and price calculation do not require an external calculation service.

## Technical spike commands

Image identification:

```powershell
npm run analyze -- ./test-data/sample-item.jpg
```

The standalone `price-reference` CLI has been retired. Price research now runs through the analysis workflow and its Marketplace Provider tests.

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
- Request and upload limits control casual public use; provider dashboard limits provide the hard cost boundary.
- Marketplace pages can change or present CAPTCHA; Curio returns partial results rather than bypassing protection.
- No automatic login, purchasing, bidding, pagination, or inventory claims are implemented.
- A missing source is shown as uncertainty instead of fabricated data.
- This is a hackathon MVP, not a professional valuation or authentication service.

## License

The source code is available under the repository's [MIT License](../LICENSE). Third-party services, marketplace content, trademarks, and visual assets remain subject to their own terms.
