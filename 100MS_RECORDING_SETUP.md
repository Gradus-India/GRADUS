# 100ms Recording Setup Guide

## Using Built-in Recording Features

100ms Prebuilt UI has **built-in recording controls** that are automatically available when recording is enabled in your template configuration.

## Setup Steps

### 1. Enable Recording in 100ms Template

1. Go to your [100ms Dashboard](https://dashboard.100ms.live/)
2. Navigate to **Templates** → Select your template (used in `HMS_TEMPLATE_ID`)
3. Go to **Recording** settings
4. Enable **Cloud Recording**
5. Configure recording settings:
   - **Mode**: Cloud Recording
   - **Resolution**: 1280x720 (HD) or higher
   - **Format**: MP4
   - **Storage**: 100ms Cloud Storage

### 2. Recording Controls in Prebuilt UI

Once enabled in the template, the 100ms Prebuilt UI will automatically show:
- **Start Recording** button (for teachers/hosts)
- **Stop Recording** button
- Recording status indicator
- Recording controls in the UI

### 3. Access Recordings

After a session ends:
1. Recordings are automatically processed by 100ms
2. Access recordings via:
   - 100ms Dashboard → Recordings
   - Or via API: `GET /live-class-api/recordings/:courseSlug`

## Benefits of Using Built-in Features

✅ **No custom code needed** - Recording controls are built into Prebuilt UI  
✅ **Automatic handling** - 100ms manages recording lifecycle  
✅ **Better UX** - Native recording controls in the video interface  
✅ **Reliable** - Uses 100ms's proven recording infrastructure  
✅ **Less maintenance** - No need to manage recording state manually  

## Recording API Endpoints (Optional)

The following endpoints are still available for programmatic access to recordings:

- `GET /live-class-api/recording-status/:roomId` - Get recording status
- `GET /live-class-api/recordings/:courseSlug` - List recordings for a course

These are useful for:
- Displaying recording history
- Linking recordings to courses
- Providing download/playback links

## Notes

- Recording controls appear automatically in Prebuilt UI when enabled in template
- Teachers/hosts can start/stop recording directly from the video interface
- Recordings are stored in 100ms cloud storage
- Recording URLs are available after processing completes

