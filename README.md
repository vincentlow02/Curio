# Curio — Tokyo Collectible Research Agent

<p align="center">
  <img src="./public/brands/curio-logo.png" width="96" alt="Curio logo">
</p>

[日本語](#日本語) ｜ [English](#english)

[Live Demo](https://foragent-testing.vercel.app/) · [Architecture](./docs/ARCHITECTURE.md) · [Developer Guide](./docs/DEVELOPMENT.md)

[![CI](https://github.com/vincentlow02/Curio/actions/workflows/ci.yml/badge.svg)](https://github.com/vincentlow02/Curio/actions/workflows/ci.yml)

## 日本語

Curio は、画像やテキストからコレクターズアイテムを識別し、日本の公開出品を比較して、参考価格と東京で探すエリアを提示するリサーチエージェントです。

**Agent Forge AI Hackathon Top 10 finalist** に選出された個人開発プロジェクトです。

> 価格はオンラインの出品価格を基にした参考値です。成約価格、真贋、実店舗の在庫は保証しません。

### 主な機能

- Qwen による商品識別と、検索前のユーザー確認・修正
- Rakuten・Mercari の公開出品を収集し、Node.js で Low / Typical / High を計算
- NDJSON による進捗表示、任意の Tavily fallback
- Collector Mode で公開オークション情報を別枠に表示
- 英語・日本語・簡体字中国語の UI と、端末内の履歴保存・復元

### アーキテクチャ

~~~text
src/
├── app/                  # ページ・API Routes
├── components/ui/        # Sidebar・設定などの共有 UI
├── features/analysis/    # Components・Hooks・Reducer・Services
├── core/                 # 共有型・識別検証・エリア推薦
├── price/                # 出品収集・照合・価格計算
└── server/               # Pipeline・Provider・環境設定・安全対策
~~~

- **Workspace → Run → Stage**：画面全体、1 回の分析、入力・確認・進捗・結果の UI を分離。
- **Hooks / Reducer / Services**：非同期処理、状態遷移、API・保存処理を分離。`isBusy` は Phase から導出。
- **Qwen / Node.js**：AI は識別、TypeScript のルールは照合・価格計算を担当。オークション価格は通常の参考範囲に混ぜません。
- **ステートレス API**：Vercel と Browserless で実行。履歴は `localStorage`、画像は IndexedDB に保存し、完了した履歴の復元では API を再実行しません。

~~~text
入力 → 識別 → ユーザー確認 → Research（NDJSON）→ 価格計算 → 結果・履歴
~~~

### 技術・ローカル実行

Next.js 16.4 / React 19 / TypeScript / Tailwind CSS 4 / Radix UI / Playwright / Vitest

Node.js 20 以上。下記を実行し、`.env.local` に必要な Provider 設定を追加してください。

~~~powershell
npm ci
Copy-Item .env.example .env.local
npx playwright install chromium
npm run dev
~~~

`WEB_USE_FIXTURE=true` は固定データのデモモードであり、実 API の成功を示すものではありません。秘密情報を Git に追加しないでください。

検証：`npm run typecheck:strict`、`npm test`、`npm run build`、`npm audit`。

詳しくは [Architecture](./docs/ARCHITECTURE.md) と [Developer Guide](./docs/DEVELOPMENT.md) を参照してください。

---

## English

Curio identifies collectibles from an image or text, compares public Japanese marketplace listings, and returns an asking-price reference with Tokyo areas worth checking.

A solo project selected as a **Top 10 finalist at the Agent Forge AI Hackathon**.

> Prices are online asking-price references, not confirmed sales, authenticity guarantees, or live physical-store inventory.

### Key features

- Qwen identification with user review and edits before research
- Public Rakuten / Mercari collection and Node.js Low / Typical / High calculation
- NDJSON progress streaming and optional Tavily fallback
- Separate public auction evidence in Collector Mode
- English, Japanese, and Simplified Chinese UI with device-local history

### Architecture

~~~text
src/
├── app/                  # Pages and API Routes
├── components/ui/        # Shared sidebar and settings UI
├── features/analysis/    # Components, hooks, reducer, services
├── core/                 # Shared types, identity validation, area suggestions
├── price/                # Collection, matching, price calculation
└── server/               # Pipeline, providers, configuration, security
~~~

- **Workspace → Run → Stage** separates the workspace, one analysis run, and input / confirmation / progress / result UI.
- **Hooks / Reducer / Services** separate async orchestration, state transitions, and API / persistence boundaries. `isBusy` is derived from Phase.
- **Qwen / Node.js** separate AI identification from rule-based TypeScript matching and pricing. Auction prices never enter the marketplace reference range.
- **Stateless APIs** run on Vercel with Browserless. Records use `localStorage`; images use IndexedDB. Restoring completed history does not repeat API calls.

~~~text
Input → Identification → Confirmation → Research (NDJSON) → Pricing → Results / History
~~~

### Stack and local setup

Next.js 16.4 / React 19 / TypeScript / Tailwind CSS 4 / Radix UI / Playwright / Vitest

Requires Node.js 20+. Run the commands below, then configure the required providers in `.env.local`.

~~~powershell
npm ci
Copy-Item .env.example .env.local
npx playwright install chromium
npm run dev
~~~

`WEB_USE_FIXTURE=true` uses fixed demo data; it does not prove a real-API pass. Never commit secrets.

Verify with `npm run typecheck:strict`, `npm test`, `npm run build`, and `npm audit`.

See [Architecture](./docs/ARCHITECTURE.md) and the [Developer Guide](./docs/DEVELOPMENT.md) for details.

## License

[MIT](./LICENSE). Third-party services, content, trademarks, and assets remain subject to their respective terms.
