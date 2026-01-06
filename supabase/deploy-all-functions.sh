#!/bin/bash
# Deploy All Supabase Functions
# Usage: ./deploy-all-functions.sh

set -e

cd "$(dirname "$0")"

echo "🚀 Starting deployment of Supabase Edge Functions..."
echo ""

FUNCTIONS=(
  "admin-uploads-api"
  "admin-auth-api"
  "admin-landing-pages-api"
  "admin-blogs-api"
  "admin-banners-api"
  "admin-courses-api"
  "admin-events-api"
  "admin-testimonials-api"
  "admin-partners-api"
  "admin-users-api"
  "admin-website-users-api"
  "admin-permissions-api"
  "admin-emails-api"
  "admin-analytics-api"
  "admin-tickets-api"
  "admin-assignments-api"
  "admin-assessments-api"
  "admin-email-templates-api"
  "admin-course-details-api"
  "admin-gallery-api"
  "admin-sitemaps-api"
  "admin-page-meta-api"
  "admin-expert-videos-api"
  "admin-why-gradus-api"
  "admin-jobs-api"
  "admin-live-sessions-api"
  "auth-api"
  "users-api"
  "courses-api"
  "blogs-api"
  "content-api"
  "event-registrations-api"
  "inquiries-api"
  "live-class-api"
  "sitemap-renderer"
  "send-email"
  "payment-processing"
  "landing-page-registration"
)

SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_FUNCTIONS=()

for func in "${FUNCTIONS[@]}"; do
  echo "📦 Deploying $func..."
  if supabase functions deploy "$func"; then
    echo "✅ Successfully deployed $func"
    ((SUCCESS_COUNT++))
  else
    echo "❌ Failed to deploy $func"
    ((FAILED_COUNT++))
    FAILED_FUNCTIONS+=("$func")
  fi
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Deployment Summary:"
echo "   ✅ Successful: $SUCCESS_COUNT"
echo "   ❌ Failed: $FAILED_COUNT"
echo ""

if [ $FAILED_COUNT -gt 0 ]; then
  echo "⚠️  Failed Functions:"
  for func in "${FAILED_FUNCTIONS[@]}"; do
    echo "   - $func"
  done
  echo ""
  exit 1
else
  echo "🎉 All functions deployed successfully!"
  exit 0
fi



