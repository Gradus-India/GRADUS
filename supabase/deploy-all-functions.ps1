# PowerShell script to deploy all Supabase Edge Functions
# Usage: .\deploy-all-functions.ps1

$ErrorActionPreference = "Continue"

Set-Location $PSScriptRoot

Write-Host "🚀 Starting deployment of Supabase Edge Functions..." -ForegroundColor Cyan
Write-Host ""

$FUNCTIONS = @(
    "admin-uploads-api",
    "admin-auth-api",
    "admin-landing-pages-api",
    "admin-blogs-api",
    "admin-banners-api",
    "admin-courses-api",
    "admin-events-api",
    "admin-testimonials-api",
    "admin-partners-api",
    "admin-users-api",
    "admin-website-users-api",
    "admin-permissions-api",
    "admin-emails-api",
    "admin-analytics-api",
    "admin-tickets-api",
    "admin-assignments-api",
    "admin-assessments-api",
    "admin-email-templates-api",
    "admin-course-details-api",
    "admin-gallery-api",
    "admin-sitemaps-api",
    "admin-page-meta-api",
    "admin-expert-videos-api",
    "admin-why-gradus-api",
    "admin-jobs-api",
    "admin-live-sessions-api",
    "auth-api",
    "users-api",
    "courses-api",
    "blogs-api",
    "content-api",
    "event-registrations-api",
    "inquiries-api",
    "live-class-api",
    "sitemap-renderer",
    "send-email",
    "payment-processing",
    "landing-page-registration"
)

$SUCCESS_COUNT = 0
$FAILED_COUNT = 0
$FAILED_FUNCTIONS = @()

foreach ($func in $FUNCTIONS) {
    Write-Host "📦 Deploying $func..." -ForegroundColor Yellow
    
    try {
        npx supabase functions deploy $func 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Successfully deployed $func" -ForegroundColor Green
            $SUCCESS_COUNT++
        } else {
            Write-Host "❌ Failed to deploy $func" -ForegroundColor Red
            $FAILED_COUNT++
            $FAILED_FUNCTIONS += $func
        }
    } catch {
        Write-Host "❌ Error deploying $func : $_" -ForegroundColor Red
        $FAILED_COUNT++
        $FAILED_FUNCTIONS += $func
    }
    
    Write-Host ""
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 Deployment Summary:" -ForegroundColor Cyan
Write-Host "   ✅ Successful: $SUCCESS_COUNT" -ForegroundColor Green
Write-Host "   ❌ Failed: $FAILED_COUNT" -ForegroundColor Red
Write-Host ""

if ($FAILED_COUNT -gt 0) {
    Write-Host "⚠️  Failed Functions:" -ForegroundColor Yellow
    foreach ($func in $FAILED_FUNCTIONS) {
        Write-Host "   - $func" -ForegroundColor Red
    }
    Write-Host ""
    exit 1
} else {
    Write-Host "🎉 All functions deployed successfully!" -ForegroundColor Green
    exit 0
}
