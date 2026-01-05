# Supabase Functions Deployment Guide

## Prerequisites

1. **Install Supabase CLI**
   ```powershell
   # Using Scoop (recommended for Windows)
   scoop install supabase
   
   # Or using npm
   npm install -g supabase
   
   # Or download from: https://github.com/supabase/cli/releases
   ```

2. **Login to Supabase**
   ```powershell
   supabase login
   ```

3. **Link Your Project**
   ```powershell
   cd supabase
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   (Find your project ref in Supabase Dashboard > Settings > General > Reference ID)

## Deployment Methods

### Method 1: Deploy All Functions (PowerShell)

```powershell
cd "D:\CFL PROJECT\gradus\supabase"
.\deploy-all-functions.ps1
```

### Method 2: Deploy All Functions (Bash - Git Bash/WSL)

```bash
cd supabase
chmod +x deploy-all-functions.sh
./deploy-all-functions.sh
```

### Method 3: Deploy Individual Functions

```powershell
cd "D:\CFL PROJECT\gradus\supabase"

# Deploy specific function
supabase functions deploy live-class-api

# Or deploy multiple functions
supabase functions deploy admin-uploads-api
supabase functions deploy admin-auth-api
supabase functions deploy live-class-api
# ... etc
```

### Method 4: Deploy via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions**
3. Click **Deploy a new function** or edit existing ones
4. Upload function folders from `supabase/functions/`

## Functions List

All functions that will be deployed:

1. admin-uploads-api
2. admin-auth-api
3. admin-landing-pages-api
4. admin-blogs-api
5. admin-banners-api
6. admin-courses-api
7. admin-events-api
8. admin-testimonials-api
9. admin-partners-api
10. admin-users-api
11. admin-website-users-api
12. admin-permissions-api
13. admin-emails-api
14. admin-analytics-api
15. admin-tickets-api
16. admin-assignments-api
17. admin-assessments-api
18. admin-email-templates-api
19. admin-course-details-api
20. admin-gallery-api
21. admin-sitemaps-api
22. admin-page-meta-api
23. admin-expert-videos-api
24. admin-why-gradus-api
25. admin-jobs-api
26. admin-live-sessions-api
27. auth-api
28. users-api
29. courses-api
30. blogs-api
31. content-api
32. event-registrations-api
33. inquiries-api
34. **live-class-api** ⭐ (Recently updated with new features)
35. sitemap-renderer
36. send-email
37. payment-processing
38. landing-page-registration

## Important: Deploy Database Migration First

Before deploying functions, make sure to push the database migration:

```powershell
cd "D:\CFL PROJECT\gradus\supabase"
supabase db push
```

This will create the tables needed for:
- Live recordings
- Chat messages
- Attendance tracking
- Hand raises
- Session controls

## Environment Variables

Make sure these are set in Supabase Dashboard > Settings > Edge Functions > Secrets:

- `HMS_ACCESS_KEY` - 100ms access key
- `HMS_SECRET` - 100ms secret
- `HMS_TEMPLATE_ID` - 100ms template ID
- `HMS_SYSTEM_SUBDOMAIN` - 100ms subdomain
- `JWT_SECRET` - JWT secret for token verification
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name (if using)
- `CLOUDINARY_API_KEY` - Cloudinary API key (if using)
- `CLOUDINARY_API_SECRET` - Cloudinary API secret (if using)

## Quick Deploy Commands

### Deploy Only Live Class API (Most Important)
```powershell
cd "D:\CFL PROJECT\gradus\supabase"
supabase functions deploy live-class-api
```

### Deploy All Admin APIs
```powershell
cd "D:\CFL PROJECT\gradus\supabase"
$adminFunctions = @("admin-uploads-api", "admin-auth-api", "admin-blogs-api", "admin-banners-api", "admin-courses-api", "admin-events-api", "admin-testimonials-api", "admin-partners-api", "admin-users-api", "admin-website-users-api", "admin-permissions-api", "admin-emails-api", "admin-analytics-api", "admin-tickets-api", "admin-assignments-api", "admin-assessments-api", "admin-email-templates-api", "admin-course-details-api", "admin-gallery-api", "admin-sitemaps-api", "admin-page-meta-api", "admin-expert-videos-api", "admin-why-gradus-api", "admin-jobs-api", "admin-live-sessions-api")
foreach ($func in $adminFunctions) { supabase functions deploy $func }
```

### Deploy All Public APIs
```powershell
cd "D:\CFL PROJECT\gradus\supabase"
$publicFunctions = @("auth-api", "users-api", "courses-api", "blogs-api", "content-api", "event-registrations-api", "inquiries-api", "live-class-api", "sitemap-renderer", "send-email", "payment-processing", "landing-page-registration")
foreach ($func in $publicFunctions) { supabase functions deploy $func }
```

## Troubleshooting

### Error: "supabase: command not found"
- Install Supabase CLI (see Prerequisites)
- Make sure it's in your PATH

### Error: "Project not linked"
- Run: `supabase link --project-ref YOUR_PROJECT_REF`
- Get project ref from Supabase Dashboard

### Error: "Function deployment failed"
- Check function logs in Supabase Dashboard
- Verify environment variables are set
- Check function code for syntax errors

### Error: "Database migration failed"
- Check migration file syntax
- Verify database permissions
- Check for conflicting migrations

## Verification

After deployment, verify functions are working:

```powershell
# List all deployed functions
supabase functions list

# Check function logs
supabase functions logs live-class-api
```

## Next Steps

After successful deployment:

1. ✅ Test live class creation
2. ✅ Test recording start/stop
3. ✅ Test chat functionality
4. ✅ Test hand raising
5. ✅ Verify attendance tracking
6. ✅ Check recording playback

