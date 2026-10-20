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
- 英語・日本語・簡体字中国語 UI、ゲスト利用、Google ログイン後の会話保存

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

ゲスト利用中の会話はページを開いている間だけ保持されます。Google ログイン後は会話と非公開画像を Supabase に保存し、ユーザー単位の Row Level Security で保護します。Vercel にデプロイする場合は Supabase の Google プロバイダー設定も必要です。

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

Google／メールアドレスとパスワードでのログイン、会話保存を有効にするには、Supabase Auth で Email プロバイダーを有効にし、必要に応じて Google プロバイダーも設定して、`supabase/migrations/20261019130000_conversation_persistence.sql` を適用してください。Supabase の Auth URL 設定にはローカルの `http://localhost:3000/auth/callback` と本番の `https://<your-domain>/auth/callback` を許可します。パスワード再設定には、それぞれの `/auth/callback?next=%2Fauth%2Freset-password` も許可します。Supabase はクエリ文字列も照合するため、ログインにはクエリなしの callback URL を使います。メール確認とパスワード再設定メールを送信する SMTP／メールテンプレートも設定してください。Google OAuth の承認済みリダイレクト URI には Supabase が表示する callback URL を設定します。`.env.local` と Vercel の環境変数に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を設定します。

Google ログインで `provider_unexpected_failure` と「Unable to exchange external code」が表示された場合、Supabase Auth ログの失敗した `/callback` を確認してください。Google とのトークン交換で発生した原因が記録されます。Supabase に設定した Google OAuth Web クライアント ID と現在のクライアントシークレットが Google Cloud の認証情報と一致するか確認します。

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
- Supports English, Japanese, and Simplified Chinese, with guest access and Google sign-in for saved conversations

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

Guest conversations remain in memory while the page is open. After Google or email/password sign-in, conversations and private images are stored in Supabase and protected by per-user Row Level Security. Enable Supabase's Email provider for email sign-up, sign-in, and password recovery; configure Google separately if Google sign-in is also required.

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

To enable email/password sign-in and saved conversations, enable the Email provider in Supabase Auth and apply `supabase/migrations/20261019130000_conversation_persistence.sql`. Configure email confirmation and password recovery delivery (SMTP and email templates), then add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` to Supabase's allowed redirect URLs. For password recovery, also allow each origin's `/auth/callback?next=%2Fauth%2Freset-password` URL. Supabase matches query strings, so sign-in uses the callback URL without one. Configure the Google provider separately if Google sign-in is required, and use the callback URL shown by Supabase as the authorized redirect URI in Google OAuth. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` and in the Vercel project environment.

If Google sign-in returns `provider_unexpected_failure` with “Unable to exchange external code,” inspect the failed `/callback` entry in Supabase Auth logs. The underlying Google token-exchange error is recorded there; verify that the Google OAuth web client ID and current client secret in Supabase match the Google Cloud credentials.

```powershell
npm run typecheck
npm test
npm run build
```

See [Architecture](./docs/ARCHITECTURE.md) and the [Developer Guide](./docs/DEVELOPMENT.md) for implementation details, limitations, and deployment instructions.

## License

[MIT](./LICENSE). Third-party services, marketplace content, trademarks, and visual assets remain subject to their respective terms.
