# Deploy Live Class API Function

## Prerequisites
1. Install Supabase CLI if not already installed:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project (if not already linked):
   ```bash
   cd GRADUS/supabase
   supabase link --project-ref YOUR_PROJECT_REF
   ```

## Deploy the Function

From the `GRADUS/supabase` directory:

```bash
supabase functions deploy live-class-api
```

## Environment Variables Required

Make sure these are set in your Supabase project dashboard under Settings > Edge Functions > Secrets:

- `HMS_ACCESS_KEY` - Your 100ms access key
- `HMS_SECRET` - Your 100ms secret
- `HMS_TEMPLATE_ID` - Your 100ms template ID
- `HMS_SYSTEM_SUBDOMAIN` - Your 100ms subdomain (e.g., "gradus.app.100ms.live")
- `JWT_SECRET` - Your JWT secret for token verification
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

## Option 2: Deploy via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to Edge Functions
3. Click "Deploy a new function"
4. Upload the `live-class-api` folder from `GRADUS/supabase/functions/live-class-api/`
5. Set the entrypoint to `index.ts`
6. Configure the environment variables listed above

## Verify Deployment

After deployment, test the endpoint:
```bash
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/live-class-api/active-classes \
  -H "Authorization: Bearer YOUR_TOKEN"
```





