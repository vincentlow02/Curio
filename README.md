# Curio — Tokyo Collectible Research Agent

<p align="center">
  <img src="./public/brands/curio-logo.png" width="96" alt="Curio logo">
</p>

**日本語** ｜ [English](#english)

[Live Demo](https://foragent-testing.vercel.app/) · [Architecture](./docs/ARCHITECTURE.md) · [Developer Guide](./docs/DEVELOPMENT.md)

[![CI](https://github.com/vincentlow02/Curio/actions/workflows/ci.yml/badge.svg)](https://github.com/vincentlow02/Curio/actions/workflows/ci.yml)

## 日本語

Curio は、日本のコレクターズアイテムを画像またはテキストから特定し、公開中の出品情報を比較して、オンライン上の参考価格と東京で探すエリアを提示するリサーチエージェントです。

Qwen は商品特定だけを担当し、価格計算は検証可能な TypeScript のルールで処理します。AI に価格判断まで任せず、識別・検索・照合・計算を分離した構成が本プロジェクトの中心です。

> 表示する価格は公開中の出品価格を基にした参考値です。成約価格、鑑定価格、真贋、店舗在庫を保証するものではありません。

### 主な機能

- 画像・テキストから商品名、バージョン、カテゴリ、日本語検索キーワードを構造化して抽出
- 検索前に識別結果をユーザーが確認・修正可能
- Playwright と Browserless で Rakuten・Mercari の公開検索結果を取得
- 型番・版・状態を照合し、重複、欠損、売り切れ、外れ値を除外
- 通常価格を Low / Typical / High の範囲として決定論的に計算
- Collector Mode で可視の版・状態情報と公開オークション情報を別枠で表示
- 各プロバイダーの失敗を分離し、利用できる結果を維持
- 英語・日本語・簡体字中国語 UI と、端末内に保存される最近の履歴

Curio は **Agent Forge AI Hackathon Top 10 finalist** に選出された個人開発プロジェクトです。
プロダクト設計、UI、API 統合、価格ロジック、テスト、デプロイまで一人で実装しました。

### 処理フロー

```text
画像 / テキスト入力
  → Qwen による構造化商品識別
  → ユーザー確認
  → Rakuten / Mercari 検索
  → 正規化・照合・重複排除・外れ値除外
  → Node.js による参考価格計算
  → 任意の Tavily fallback / Daytona 検証
  → 参考価格・根拠 URL・東京エリアを表示
```

本番環境はステートレスです。サーバー側データベースは使用せず、最近の履歴と画像プレビューはブラウザの `localStorage` と IndexedDB に保存します。

### 技術スタック

| 領域 | 技術 |
| --- | --- |
| Frontend / API | Next.js 16, React 19, TypeScript |
| AI | Qwen（OpenAI-compatible API） |
| Data collection | Playwright Core, Browserless |
| Fallback / Verification | Tavily, Daytona |
| Test / Deploy | Vitest, GitHub Actions, Vercel |

### ローカル実行

Node.js 20 以上が必要です。

```powershell
npm install
npx playwright install chromium
Copy-Item .env.example .env.local
npm run dev
```

`.env.local` に Qwen などの認証情報を設定してください。外部 API を使わず UI と計算フローを確認する場合は `WEB_USE_FIXTURE=true` を使用できます。秘密情報は `NEXT_PUBLIC_` 変数や Git に含めないでください。

```powershell
npm run typecheck
npm test
npm run build
```

詳しい構成、制約、デプロイ方法は [Architecture](./docs/ARCHITECTURE.md) と [Developer Guide](./docs/DEVELOPMENT.md) を参照してください。

---

## English

Curio is a research agent that identifies Japanese collectibles from an image or text, compares public marketplace listings, and returns an online asking-price reference with Tokyo areas worth checking.

Qwen handles product identification only. Pricing is performed by testable TypeScript rules, keeping identification, collection, matching, and calculation as separate stages instead of asking one model to decide everything.

> Curio reports references based on public asking prices. It does not claim confirmed sale prices, appraisal value, authenticity, or live store inventory.

### Key features

- Extracts a structured item name, version, category, and Japanese search keyword from an image or text
- Lets the user review and edit the identity before research starts
- Reads public Rakuten and Mercari search results through Playwright and Browserless
- Matches model and edition details, then removes duplicates, incomplete results, sold-out items, and price outliers
- Calculates a deterministic Low / Typical / High asking-price range
- Keeps visible edition evidence and active-auction signals separate in Collector Mode
- Isolates provider failures so partial evidence can still be returned
- Supports English, Japanese, and Simplified Chinese, with recent history stored on the device

Curio was selected as a **Top 10 finalist at the Agent Forge AI Hackathon** and was built as a solo project.
I independently implemented the product design, UI, API integrations, pricing logic, tests, and deployment.

### Runtime flow

```text
Image / text input
  → structured Qwen identification
  → user confirmation
  → Rakuten / Mercari search
  → normalization, matching, deduplication, outlier removal
  → deterministic Node.js price calculation
  → optional Tavily fallback / Daytona verification
  → price reference, source URLs, and Tokyo area suggestions
```

Production requests are stateless. There is no server-side database; recent records and image previews remain in the browser through `localStorage` and IndexedDB.

### Stack

| Area | Technology |
| --- | --- |
| Frontend / API | Next.js 16, React 19, TypeScript |
| AI | Qwen through an OpenAI-compatible API |
| Data collection | Playwright Core, Browserless |
| Fallback / verification | Tavily, Daytona |
| Testing / deployment | Vitest, GitHub Actions, Vercel |

### Run locally

Node.js 20 or newer is required.

```powershell
npm install
npx playwright install chromium
Copy-Item .env.example .env.local
npm run dev
```

Add the required provider credentials to `.env.local`. Set `WEB_USE_FIXTURE=true` to review the interface and deterministic pipeline without external API usage. Never place secrets in `NEXT_PUBLIC_` variables or commit them to Git.

```powershell
npm run typecheck
npm test
npm run build
```

See [Architecture](./docs/ARCHITECTURE.md) and the [Developer Guide](./docs/DEVELOPMENT.md) for implementation details, limitations, and deployment instructions.

## License

[MIT](./LICENSE). Third-party services, marketplace content, trademarks, and visual assets remain subject to their respective terms.
