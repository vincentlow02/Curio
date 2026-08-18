# Vercel 环境变量自动配置脚本

Write-Host "=== Vercel 环境变量配置 ===" -ForegroundColor Cyan

# 提示输入 Browserless Token
$token = Read-Host "请输入你的 Browserless API Token"

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "❌ Token 不能为空" -ForegroundColor Red
    exit 1
}

Write-Host "开始添加环境变量..." -ForegroundColor Yellow

# 检查 vercel CLI 是否已安装
$vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelCmd) {
    Write-Host "❌ vercel CLI 未安装，运行: npm install -g vercel" -ForegroundColor Red
    exit 1
}

# 定义环变
$envVars = @{
    "BROWSER_PROVIDER" = "browserless"
    "BROWSERLESS_WS_ENDPOINT" = "wss://production-sfo.browserless.io"
    "BROWSERLESS_API_TOKEN" = $token
    "BROWSER_SESSION_TIMEOUT_SECONDS" = "55"
    "RESEARCH_TIME_BUDGET_SECONDS" = "240"
}

# 逐个添加
$envVars.GetEnumerator() | ForEach-Object {
    Write-Host "⏳ 添加 $($_.Key)..." -ForegroundColor Cyan
    
    # 通过 stdin 传入值
    $_.Value | vercel env add $_.Key
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ $($_.Key) 添加成功" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $($_.Key) 可能需要手动确认" -ForegroundColor Yellow
    }
}

Write-Host "✅ 完成！请去 Vercel Dashboard 确认所有变量已添加" -ForegroundColor Green
