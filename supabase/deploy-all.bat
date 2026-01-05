@echo off
echo 🚀 Starting deployment of all Supabase Edge Functions...
echo.

call npx supabase functions deploy admin-uploads-api
call npx supabase functions deploy admin-auth-api
call npx supabase functions deploy admin-landing-pages-api
call npx supabase functions deploy admin-blogs-api
call npx supabase functions deploy admin-banners-api
call npx supabase functions deploy admin-courses-api
call npx supabase functions deploy admin-events-api
call npx supabase functions deploy admin-testimonials-api
call npx supabase functions deploy admin-partners-api
call npx supabase functions deploy admin-users-api
call npx supabase functions deploy admin-website-users-api
call npx supabase functions deploy admin-permissions-api
call npx supabase functions deploy admin-emails-api
call npx supabase functions deploy admin-analytics-api
call npx supabase functions deploy admin-tickets-api
call npx supabase functions deploy admin-assignments-api
call npx supabase functions deploy admin-assessments-api
call npx supabase functions deploy admin-email-templates-api
call npx supabase functions deploy admin-course-details-api
call npx supabase functions deploy admin-gallery-api
call npx supabase functions deploy admin-sitemaps-api
call npx supabase functions deploy admin-page-meta-api
call npx supabase functions deploy admin-expert-videos-api
call npx supabase functions deploy admin-why-gradus-api
call npx supabase functions deploy admin-jobs-api
call npx supabase functions deploy admin-live-sessions-api
call npx supabase functions deploy auth-api
call npx supabase functions deploy users-api
call npx supabase functions deploy courses-api
call npx supabase functions deploy blogs-api
call npx supabase functions deploy content-api
call npx supabase functions deploy event-registrations-api
call npx supabase functions deploy inquiries-api
call npx supabase functions deploy live-class-api
call npx supabase functions deploy sitemap-renderer
call npx supabase functions deploy send-email
call npx supabase functions deploy payment-processing
call npx supabase functions deploy landing-page-registration

echo.
echo ✅ Deployment complete!

