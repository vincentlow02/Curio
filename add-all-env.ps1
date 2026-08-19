# 批量添加环变到 Vercel

$envVars = @{
    "QWEN_API_KEY" = "sk-ws-H.DMPHDDD.Gu8y.MEUCIQCGOhsFeDPMAW7YIV5UNY2lD23Vk3b4rzwl-uedPIhFPQIgdzx9VOUSsFwCBooRYyEP0RnjPl4Qlcodwqmf4ifwYrU"
    "QWEN_BASE_URL" = "https://ws-9obxdlh1vymbcmhv.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    "QWEN_VISION_MODEL" = "qwen3-vl-plus"
    "QWEN_AGENT_MODEL" = "qwen3.7-plus"
    "QWEN_TEXT_MODEL" = "qwen3.6-flash"
    "TAVILY_API_KEY" = "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"
    "DAYTONA_API_KEY" = "dtn_5fed3f3f342c5c567d3367b488bbdfb3da4b52da62411098a866f06e06cae149"
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
