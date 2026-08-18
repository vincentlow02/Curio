# 部署到 Vercel 检查清单

## 阶段 1：获取 Browserless Token
- [ ] 访问 https://www.browserless.io/
- [ ] 注册或登录免费账户
- [ ] 进入 Dashboard
- [ ] 复制 **API Token**（不是 WebSocket URL）
- [ ] 记录 WebSocket 端点：`wss://production-sfo.browserless.io`

## 阶段 2：配置 Vercel 环境变量
- [ ] 访问 Vercel 项目：https://vercel.com/dashboard
- [ ] 进入项目设置 → **Environment Variables**
- [ ] 添加以下变量（标记为 Production 环境）：

```
BROWSER_PROVIDER              = browserless
BROWSERLESS_WS_ENDPOINT       = wss://production-sfo.browserless.io
BROWSERLESS_API_TOKEN         = [你的 Browserless Token]
BROWSER_SESSION_TIMEOUT_SECONDS = 55
RESEARCH_TIME_BUDGET_SECONDS  = 240
```

- [ ] **保存**变量（Vercel 会自动加密）

## 阶段 3：验证 Vercel 配置
- [ ] 进入项目 **Settings**
- [ ] 查看 **Functions** 部分
- [ ] 确认启用了 **Fluid Compute**（如果需要）
- [ ] 查看 **Research API 路由**的超时限制（应该 ≥ 300s）

## 阶段 4：部署
- [ ] 在本地运行：`npm run build`（确保通过）
- [ ] 提交代码到 Git
- [ ] Push 到 main 分支触发自动部署
- [ ] 在 Vercel Dashboard 监控构建进度
- [ ] 等待部署成功

## 阶段 5：测试验证
- [ ] 访问 Live Demo URL（来自 Vercel）
- [ ] **普通模式测试**（≥3 次）：
  - [ ] 上传图片
  - [ ] 运行 Research
  - [ ] 验证返回结果无错误
  
- [ ] **Collector Mode 测试**（≥3 次）：
  - [ ] 启用 Collector Mode
  - [ ] 上传图片
  - [ ] 验证四个来源并发执行
  - [ ] 检查 NDJSON 流式响应

- [ ] **错误场景测试**：
  - [ ] 上传无效图片
  - [ ] 验证单个市场失败不影响其他市场
  - [ ] 检查超时保护

## 阶段 6：监控
- [ ] 打开 **Browserless Dashboard**
- [ ] 查看 **Sessions** 历史
- [ ] 检查一次完整 Research 的 Units 消耗
- [ ] 确认 Tavily 回退是否被触发（应该很少）

## 备注
- 本地开发仍使用本地 Chromium（`BROWSER_PROVIDER=local` 或不设置）
- Production 只连接 Browserless（环境变量覆盖）
- 如果出现 Token 过期，重新生成并更新 Vercel 环保量
