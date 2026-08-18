# 批量添加环变到 Vercel

$envVars = @{
    "QWEN_API_KEY" = "sk-ws-H.XHPDRE.lycm.MEUCIGGvJXnfZ49E94u6D1RJz0mvxIwbIBnQyQK2FHTamhxDAiEAkygB19jP5EnlUJg_UoSyYGTHz9DCd6iGdqLvaLYb-yE"
    "QWEN_BASE_URL" = "https://ws-9obxdlh1vymbcmhv.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    "QWEN_VISION_MODEL" = "qwen3-vl-plus"
    "QWEN_AGENT_MODEL" = "qwen3.7-plus"
    "QWEN_TEXT_MODEL" = "qwen3.6-flash"
    "TAVILY_API_KEY" = "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"
    "DAYTONA_API_KEY" = "dtn_e393679a4d871f020c997b12656b709eb85f5ae108dff972fee729b68c3e3f43"
    "DAYTONA_API_URL" = "https://app.daytona.io/api"
    "ENABLE_DAYTONA_PROCESSING" = "true"
    "DAYTONA_CREATE_TIMEOUT_SECONDS" = "60"
    "DAYTONA_EXECUTION_TIMEOUT_SECONDS" = "30"
    "DAYTONA_STATE_TTL_HOURS" = "168"
    "ENABLE_TAVILY_PRICE_FALLBACK" = "true"
    "MAX_TAVILY_SEARCH_CALLS" = "1"
    "MAX_TAVILY_RESULTS" = "2"
    "MAX_FALLBACK_DETAIL_PAGES" = "2"
    "ALLOW_SECOND_FALLBACK_SEARCH" = "false"
    "WEB_USE_FIXTURE" = "false"
    "PLAYWRIGHT_HEADLESS" = "true"
    "MAX_ANALYSES_PER_IP" = "50"
    "NEXT_PUBLIC_GA_MEASUREMENT_ID" = "G-S0W2VWDR00"
    "NEXT_PUBLIC_CLARITY_PROJECT_ID" = "xsk9tmn7u4"
}

Write-Host "开始添加 $(($envVars.Count)) 个环变到 Vercel..." -ForegroundColor Cyan

$envVars.GetEnumerator() | ForEach-Object {
    $key = $_.Key
    $value = $_.Value
    
    Write-Host "⏳ 添加 $key..." -ForegroundColor Yellow
    echo $value | vercel env add $key production
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ $key 成功" -ForegroundColor Green
    } else {
        Write-Host "❌ $key 失败" -ForegroundColor Red
    }
}

Write-Host "`n✅ 全部完成！" -ForegroundColor Green
