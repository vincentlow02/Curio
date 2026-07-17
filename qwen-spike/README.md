# Controlled Collectible Agent Pipeline

Node.js + TypeScript technical spike：

1. Qwen VL 识别本地收藏品图片，生成严格 JSON、价格搜索词和最多两个东京购物区域。
2. Playwright 读取 Rakuten 与 Mercari 公开搜索结果页。
3. Node.js 排除错误型号、配件、故障品、缺件、套装和重复商品，并生成稳健的线上挂牌价格区间。
4. 可选读取一次 Google Maps 搜索结果验证具体店名；Qwen 永远不能生成店名。

当前版本不使用 Google Places API、电商 API、数据库或 UI。主要价格来源只有 Rakuten 和 Mercari；Tavily 只在两者都没有有效样本时调用一次，用于发现最多两个候选网页。

## 安装

```powershell
cd "C:\Users\user\Documents\foragent testing\qwen-spike"
npm install
npx playwright install chromium
Copy-Item .env.example .env.local
```

需要 Node.js 20 或更高版本。

## 环境变量

```dotenv
QWEN_API_KEY=你的新加坡Workspace API Key
QWEN_BASE_URL=https://你的WorkspaceId.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
QWEN_VISION_MODEL=qwen3-vl-plus

PLAYWRIGHT_HEADLESS=false
MAX_MARKETPLACE_CARDS_SCANNED_PER_SOURCE=30
MAX_PRICE_SAMPLES_PER_SOURCE=5
MAX_VERIFIED_STORES=3
PRICE_CACHE_TTL_HOURS=24
STORE_CACHE_TTL_HOURS=168
TAVILY_API_KEY=你的Tavily API Key
ENABLE_TAVILY_PRICE_FALLBACK=true
MAX_TAVILY_SEARCH_CALLS=1
MAX_TAVILY_RESULTS=2
MAX_FALLBACK_DETAIL_PAGES=2
ALLOW_SECOND_FALLBACK_SEARCH=false

DAYTONA_API_KEY=你的Daytona API Key
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_TARGET=
ENABLE_DAYTONA_PROCESSING=true
DAYTONA_CREATE_TIMEOUT_SECONDS=60
DAYTONA_EXECUTION_TIMEOUT_SECONDS=30
DAYTONA_STATE_TTL_HOURS=168
```

代码硬限制：Qwen 最多一次且不自动重试；Rakuten/Mercari 各一页；每个来源最多扫描 30 个卡片并保留 5 个样本；商品详情页为 0；Google Maps 验证最多一页、三家店。

不要提交 `.env.local`，也不要把 API Key 放进代码、fixture、trace 或输出文件。

## Daytona 确定性处理层

Daytona 是可选的运行时计算层，不负责搜索，也不运行 LLM。启用后，流程为：

```text
Qwen VL 识别
→ Playwright 读取 Rakuten / Mercari
→ Node 过滤候选
→ Daytona TypeScript Sandbox 重新计算 MAD 异常值和价格区间
→ 严格 JSON
```

Sandbox 禁止网络访问，不接收 Qwen、Rakuten、Mercari 或其他 API Key。每次 live 最多创建一个 Sandbox；计算完成后立即停止，并在 168 小时后自动删除。远端状态保存在：

```text
/home/daytona/session/{sessionId}/state.json
```

同一份状态也写入当前运行目录的 `daytona-state.json`。`trace.json` 记录 Sandbox ID、状态路径、耗时和是否回退；`cost.json` 记录 `daytonaCalls`、`daytonaSandboxesCreated` 和 `daytonaDurationMs`。Daytona 不使用 LLM，因此不会增加 token。

Daytona 缺少配置、认证失败、超时或返回无效 JSON 时，程序保留本地 Node 的确定性结果，并在 warnings 中说明回退原因。不会自动重试或调用其他模型。

只验证 Daytona 连接和计算、完全不读取真实商城网页：

```powershell
npm run daytona-smoke
```

该命令使用本地合成 fixture，但会创建一次真实 Daytona Sandbox。不要在 CI 中默认运行。

## Spike #1：图片识别

```powershell
npm run analyze -- ./test-data/sample-item.jpg
```

强制忽略图片缓存：

```powershell
npm run analyze -- ./test-data/sample-item.jpg --refresh
```

输出：

```text
output/item-profile.json
output/item-profile-cost.json
```

`recommendedAreas` 只允许包含：

```json
{
  "area": "秋葉原",
  "reason": "中古游戏机店较集中",
  "storeSearchKeywordJa": "秋葉原 中古 レトロゲーム 店舗"
}
```

Schema 不允许 Qwen 输出具体店名。图片缓存键由图片内容、模型名称和 Prompt 版本组成；重复图片命中缓存时 Qwen 调用与 Token 都为 0。

## Price Spike：Rakuten + Mercari

完全离线 fixture：

```powershell
npm run price-reference -- --fixture --input ./fixtures/price-reference/input.json
```

包含合成 Google Maps 结果的 fixture：

```powershell
npm run price-reference -- --fixture --input ./fixtures/price-reference/input.json --verify-stores
```

真实价格页面：

```powershell
npm run price-reference -- --live --input ./output/item-profile.json
```

24 小时内相同关键词默认读取缓存。强制刷新：

```powershell
npm run price-reference -- --live --input ./output/item-profile.json --refresh
```

Mercari 搜索自动移除「中古」并使用 `status=on_sale`。Mercari 明确标注新品/未使用的商品会保留并标记 `condition: new`，但不会混入中古参考区间。

### Tavily 价格 fallback

Tavily 是严格的最后兜底，不是默认价格来源。只有 Node 完成身份过滤后，Rakuten 和 Mercari 的有效样本都为 0，程序才执行：

```text
商品名称 + 品牌/系列 + 型号 + 中古 価格
→ 一次 Tavily basic 搜索
→ Tavily 只返回最多两个候选 URL
→ Playwright 最多打开这两个 HTTPS 页面
→ 验证商品身份
→ 读取结构化价格或页面中的明确日元价格
```

不会点击第三个结果，不会继续点击结果页面中的链接，不会追加或改写第二轮搜索，也不会调用 Qwen。普通角色商品不能代替特定版本：玩具必须同时命中角色/品牌锚点和版本特征锚点。

Tavily 请求固定使用 `search_depth: "basic"`、`auto_parameters: false`、`max_results: 2`，并关闭 answer、raw content 和 images。Tavily 只负责发现 URL，价格必须来自 Playwright 实际打开的网页。fallback 样本使用 `source: "Web fallback"`、`listingStatus: "unknown"`，并保留真实来源 URL。前两页身份不匹配或没有明确日元价格时，返回空价格区间，不捏造数据。

每次运行额外保存：

```text
fallback-search-snapshot.json
```

`cost.json` 记录 `tavilySearchCalls`、`tavilyCredits` 和 `fallbackDetailPagesOpened`；有效缓存命中时搜索调用和页面打开数为 0。

## 可选店铺验证

默认只输出区域和可点击的 Google Maps 搜索链接，不显示任何未经外部来源验证的店名。

需要具体店名时显式运行：

```powershell
npm run price-reference -- --live --input ./output/item-profile.json --verify-stores
```

程序只验证第一个推荐区域，最多读取一次 Google Maps 搜索页、保留三家结果，并为每家保留 Maps URL。结果使用 `verificationStatus: maps_search_result`，只能表示搜索结果中存在该地点，不能表示有实时库存。

遇到 CAPTCHA 或页面读取失败时不重试、不切换 Tavily、不让 Qwen补造店名，只保留区域搜索链接。店铺验证缓存为 168 小时。

## 价格区间

`observedRange` 保留真实抓到的最小/最大挂牌价。`referenceRange` 只使用中古、型号匹配且通过 MAD 异常值检测的样本：

```json
{
  "observedRange": { "min": 8000, "max": 70000, "sampleCount": 10 },
  "referenceRange": {
    "low": 8000,
    "median": 12000,
    "high": 16000,
    "sampleCount": 9,
    "method": "median_absolute_deviation"
  }
}
```

异常值仍保留在 `samples` 和 trace 中，但标记：

```json
{
  "includedInReferenceRange": false,
  "aggregationExclusionReason": "price_outlier"
}
```

`conditionRanges` 分开计算 `used`、`new` 和 `unknown`。最终价格只能描述为 `Online asking-price reference`，不能描述为真实成交价。

## Replay 与审计文件

```powershell
npm run price-reference -- --replay <runId>
```

每次运行生成：

```text
output/price-reference/{runId}/
  input.json
  search-snapshot.json
  fallback-search-snapshot.json
  store-snapshot.json
  daytona-state.json
  result.json
  trace.json
  cost.json
```

`trace.json` 记录过滤、聚合排除、缓存键和缓存命中；`cost.json` 记录浏览器页数、Qwen/Token 数、缓存命中和耗时。

## 本地验证

```powershell
npm run typecheck
npm run price-reference -- --fixture --input ./fixtures/price-reference/input.json
npm run price-reference -- --fixture --input ./fixtures/price-reference/input.json --verify-stores
```

fixture 不调用 Qwen，不启动浏览器，不访问 Rakuten、Mercari、Google、Tavily 或其他网络服务。

## 常见错误

- `Missing script`：先进入 `qwen-spike` 目录。
- Playwright 找不到浏览器：运行 `npx playwright install chromium`。
- Mercari 没有渲染商品：保持 `PLAYWRIGHT_HEADLESS=false`。
- Google Maps CAPTCHA：不绕过；结果退化为区域搜索链接。
- 样本不足：返回实际数量和 warning，不补造商品。
- Qwen 401/404：检查新加坡 Workspace API Key、Base URL 和模型权限。
