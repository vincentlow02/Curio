# Curio — Tokyo Collectible Research Agent

<p align="center">
  <img src="./public/brands/curio-logo.png" width="96" alt="Curio logo">
</p>

Curio is a full-stack web application that identifies a collectible from an image or text, checks public Japanese marketplace listings, calculates an explainable asking-price reference, and suggests Tokyo shopping areas.

[Live demo](https://curio-web-production-49c7.up.railway.app) · [Architecture](./docs/ARCHITECTURE.md) · [Developer guide](./docs/DEVELOPMENT.md)

[![CI](https://github.com/vincentlow02/Tokyo-Collectible-Research-Agent/actions/workflows/ci.yml/badge.svg)](https://github.com/vincentlow02/Tokyo-Collectible-Research-Agent/actions/workflows/ci.yml)

> Curio reports public asking prices. It does not claim confirmed sale prices, authenticity, appraised value, or live store inventory.

## My contribution

Curio was designed and implemented independently by the repository owner from the initial product idea through the deployed demo. The work includes:

- defining the product scope and end-to-end architecture;
- integrating Qwen image and text identification with structured output validation;
- designing and implementing the deterministic listing filters and price-reference algorithm;
- building the responsive, localized user interface and analysis workflow;
- implementing provider orchestration, session handling, queue limits, upload validation, and error redaction;
- containerizing and deploying the application on Railway;
- adding automated tests, strict type checks, GitHub Actions, production smoke tests, GA4, and Microsoft Clarity.

AI services are used at runtime for item identification and controlled fallback research. The application logic, pricing rules, interface, deployment configuration, and test suite are implemented in this repository.

## Recognition

Curio was selected as a **Top 10 finalist** at the **Agent Forge AI Hackathon**. It was built and presented as a solo project.

## What the project does

1. Accepts a photo or a specific text description.
2. Uses Qwen to produce a structured identity: item name, version, category, and Japanese search keyword.
3. Lets the user review the identity before marketplace research begins.
4. Reads public Rakuten and Mercari result pages with Playwright.
5. Filters mismatched, duplicate, broken, incomplete, sold-out, and extreme-price listings.
6. Calculates a low, median, and high asking-price reference in deterministic Node.js code.
7. Shows source links, warnings, Tokyo area suggestions, and per-provider run details.

Supported categories are toys and character goods, cards and game collectibles, and records and music memorabilia. Collector Mode also records visible edition and condition evidence and checks limited active-auction signals separately from the price range.

## Architecture in simple language

The AI identifies the item, but it does not decide the price. Pricing is calculated by regular TypeScript code from listings that pass explicit matching rules. This separation makes the result easier to inspect and test.

```text
User
  ↓
Next.js frontend
  ↓
Next.js API routes
  ↓
In-memory session queue
  ↓
Qwen identification + Playwright marketplace collection
  ↓
Deterministic Node.js price calculation
  ↓
Optional Tavily fallback + Daytona verification
  ↓
Result returned to the frontend
```

There is no database in the current demo. Analysis sessions are kept in server memory for a limited time. Recent history and image previews stay in the user's browser through `localStorage` and IndexedDB.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for component responsibilities, trust boundaries, and design tradeoffs.

## Engineering decisions

| Decision | Reason |
| --- | --- |
| Constrain Qwen to structured identification | Keeps model output away from pricing and inventory claims. |
| Calculate prices in TypeScript | Makes filtering and aggregation repeatable and unit-testable. |
| Keep source URLs with every sample | Lets users inspect the evidence behind the range. |
| Use median absolute deviation for outliers | Prevents a small number of extreme listings from dominating the range. |
| Use a bounded single-worker queue | Limits concurrent browser and model work in the single-instance demo. |
| Run optional Daytona verification | Recalculates normalized price data independently without sharing provider keys. |
| Treat Tavily as a limited fallback | It runs only when primary marketplaces provide no valid samples. |

## Technology

| Area | Tools used |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Geist |
| Backend | Next.js Route Handlers, Node.js |
| AI identification | Qwen through an OpenAI-compatible API |
| Data collection | Playwright, Rakuten, Mercari, optional Yahoo! Auctions and Mandarake Auction |
| Fallback and verification | Tavily, Daytona |
| Testing | Vitest, TypeScript strict checks, container smoke test |
| Deployment and analytics | Docker, Railway, GitHub Actions, GA4, Microsoft Clarity |

## Project structure

Only the main folders are shown here:

```text
.
├── .github/workflows/       CI checks for tests, types, build, audit, and container smoke test
├── docs/                    Architecture and project documentation
├── src/app/                 Pages and API routes
├── src/features/            Analysis UI, polling, localization, and browser-side history
├── src/core/                Identification contracts and recommendation rules
├── src/price/               Marketplace capture, matching, filtering, and price calculation
├── src/server/              Pipeline orchestration, providers, queue, sessions, and security
├── src/daytona/             Independent price-calculation verification
├── tests/                   Unit and integration tests
└── public/                  Brand and interface assets
```

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm
- Chromium installed through Playwright
- Optional provider accounts for live mode: Qwen, Daytona, and Tavily

### Installation

```bash
git clone https://github.com/vincentlow02/Tokyo-Collectible-Research-Agent.git
cd Tokyo-Collectible-Research-Agent
npm install
npx playwright install chromium
```

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`.

### Environment variables

Never commit `.env.local`. Use placeholders such as these:

```dotenv
QWEN_API_KEY=your-qwen-api-key
QWEN_BASE_URL=https://your-workspace-id.example.com/compatible-mode/v1
QWEN_VISION_MODEL=your-vision-model
QWEN_TEXT_MODEL=your-text-model

DEMO_ACCESS_CODE=replace-with-a-long-demo-code
WEB_USE_FIXTURE=true

DAYTONA_API_KEY=your-daytona-api-key
ENABLE_DAYTONA_PROCESSING=false

TAVILY_API_KEY=your-tavily-api-key
ENABLE_TAVILY_PRICE_FALLBACK=false

NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_CLARITY_PROJECT_ID=
```

Use `WEB_USE_FIXTURE=true` to explore the interface and deterministic pipeline without consuming provider credits. The complete variable list and safe placeholders are in [`.env.example`](./.env.example).

### Local development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build and verify

```bash
npm run typecheck
npm test
npm run build
```

The current repository contains 37 passing tests across 8 test files. GitHub Actions also runs a production container smoke test.

## Demo

- Live application: [curio-web-production-49c7.up.railway.app](https://curio-web-production-49c7.up.railway.app)
- GitHub: [vincentlow02/Tokyo-Collectible-Research-Agent](https://github.com/vincentlow02/Tokyo-Collectible-Research-Agent)
- Access code: `agentforge`
- Portfolio recommendation: add one home-screen screenshot, one completed result screenshot, and a short GIF showing upload → identity review → result. Make sure the recording does not expose provider keys, account details, or private dashboards.

The access code is public for portfolio review. Because the demo calls metered external services, it may be rotated or temporarily disabled if usage becomes excessive.

## Challenges and learnings

1. **Separating probabilistic and deterministic work.** Qwen is useful for reading images and normalizing item identity, but price calculation needs repeatable rules. The pipeline therefore stops after identification for user confirmation, then computes the range in TypeScript.
2. **Comparing noisy marketplace listings.** Search pages contain accessories, bundles, broken items, new stock, duplicates, and similar models. The matcher records explicit exclusion reasons and applies median absolute deviation only after identity and condition filtering.
3. **Handling unreliable external pages.** Marketplace layouts can change or present CAPTCHA. Each source reports its own status, partial results remain usable, and Tavily is limited to a small fallback path instead of silently replacing the primary sources.
4. **Managing long-running analysis without a database.** The demo uses polling, an in-memory session store, and a bounded queue. This is simple to deploy, but it requires one server instance and loses sessions after a restart.
5. **Keeping a public demo safe.** Uploads are size- and signature-checked, temporary images are deleted after identification, provider errors are redacted, secrets remain server-side, and CI smoke-tests the production container as a non-root user.

## Current limitations

- The access code is a shared demo gate, not user authentication.
- Sessions and the queue are stored in memory, so the deployment must use one replica and active sessions disappear after a restart.
- Recent history is local to one browser and is not synchronized across devices.
- Public marketplace scraping may fail when page structure changes, access is blocked, or CAPTCHA appears.
- Asking prices are not confirmed transaction prices and are not an appraisal.
- Store suggestions do not claim live inventory; users must verify availability themselves.
- The project does not yet include public screenshots, a demo GIF, load-test results, or accuracy benchmarks.

## Future improvements

- Move sessions and jobs to a durable store and queue before adding multiple server replicas.
- Replace the shared access code with user accounts and per-user usage limits.
- Add monitored source adapters and saved HTML fixtures for marketplace layout changes.
- Add structured server-side provider error logging without exposing secrets to clients.
- Create a small labeled evaluation set for identification accuracy and price-filtering regressions.
- Add the recommended screenshots and demo GIF before using the repository in applications.

## License

The source code is available under the [MIT License](./LICENSE), allowing reuse, modification, and distribution with attribution. Third-party services, marketplace content, trademarks, and visual assets remain subject to their own terms.
