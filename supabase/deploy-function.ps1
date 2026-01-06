# PowerShell script to deploy a single Supabase function
# Usage: .\deploy-function.ps1 -FunctionName "admin-uploads-api"

param(
    [Parameter(Mandatory=$true)]
    [string]$FunctionName
)

Set-Location $PSScriptRoot

Write-Host "🚀 Deploying $FunctionName..." -ForegroundColor Cyan

try {
    supabase functions deploy $FunctionName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully deployed $FunctionName" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "❌ Failed to deploy $FunctionName" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error deploying $FunctionName : $_" -ForegroundColor Red
    exit 1
}



