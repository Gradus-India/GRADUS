#!/bin/bash
# Quick Deploy Script - Login, Link, and Deploy
# Usage: ./quick-deploy.sh

set -e

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Supabase Quick Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if already logged in
if ! supabase projects list &>/dev/null; then
    echo "🔐 Logging in to Supabase..."
    supabase login
    echo ""
fi

# Check if project is linked
if [ ! -f ".supabase/config.toml" ] || ! grep -q "project_id" .supabase/config.toml 2>/dev/null; then
    echo "🔗 Linking project..."
    read -p "Enter your Supabase project reference: " PROJECT_REF
    if [ -z "$PROJECT_REF" ]; then
        echo "❌ Project reference is required"
        exit 1
    fi
    supabase link --project-ref "$PROJECT_REF"
    echo ""
fi

# Deploy functions
echo "📦 Deploying functions..."
echo ""
if [ -f "deploy-all-functions.sh" ]; then
    chmod +x deploy-all-functions.sh
    ./deploy-all-functions.sh
else
    echo "⚠️  deploy-all-functions.sh not found. Deploying admin-uploads-api as example..."
    supabase functions deploy admin-uploads-api
fi

echo ""
echo "🗄️  Pushing database migrations (if any)..."
supabase db push || echo "⚠️  No migrations to push or error occurred"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"


