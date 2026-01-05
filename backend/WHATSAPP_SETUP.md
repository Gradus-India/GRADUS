# WhatsApp Reminder Setup Guide

This guide explains how to set up WhatsApp reminders for landing page registrations using Twilio's WhatsApp API.

## Requirements

### 1. Twilio Account Setup

1. **Create a Twilio Account**
   - Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
   - Sign up for a free account (includes $15.50 credit for testing)

2. **Get Your Twilio Credentials**
   - Account SID: Found in your Twilio Console dashboard
   - Auth Token: Found in your Twilio Console dashboard (click to reveal)

3. **Enable WhatsApp in Twilio**
   - Go to: [Twilio Console → Messaging → Try it out → Send a WhatsApp message](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
   - Follow the setup wizard to join the WhatsApp Sandbox

### 2. WhatsApp Sandbox Setup (For Testing)

1. **Join the Sandbox**
   - Send the join code to the Twilio WhatsApp number (shown in console)
   - Example: Send "join [code]" to `+1 415 523 8886`
   - You'll receive a confirmation message

2. **Test Numbers**
   - Add test numbers to your sandbox (up to 3 numbers)
   - These numbers can receive WhatsApp messages for free during testing

### 3. Production Setup (Optional - For Real Numbers)

For production use with real phone numbers, you need:

1. **WhatsApp Business Profile**
   - Apply through Twilio Console
   - Business verification required
   - Approval can take 1-3 business days

2. **Message Templates**
   - Create message templates in Twilio Console
   - Submit for WhatsApp approval
   - Templates are required for initial messages (outside 24-hour window)

## Environment Variables

Add these to your Supabase Edge Functions secrets:

```bash
# Twilio Credentials
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here

# Optional: Custom WhatsApp From Number (defaults to sandbox)
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

### Setting Secrets in Supabase

1. Go to your Supabase Dashboard
2. Navigate to: **Project Settings → Edge Functions → Secrets**
3. Add the following secrets:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM` (optional, for production)

Or use Supabase CLI:

```bash
supabase secrets set TWILIO_ACCOUNT_SID=your_account_sid
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

## Pricing

### Sandbox (Testing)
- **Free**: Up to 3 test numbers
- **Cost**: $0 for sandbox testing

### Production
- **Per Message**: ~$0.005 - $0.01 per message
- **Template Messages**: Slightly higher cost
- **Conversation Window**: Free for 24 hours after user replies

## Features

### Current Implementation

✅ **WhatsApp Reminder Integration**
- Sends WhatsApp reminders alongside email reminders
- Automatic phone number normalization (handles Indian numbers)
- Error handling and reporting
- Bulk sending support

### Message Format

WhatsApp messages include:
- Personalized greeting
- Masterclass date and time
- Mentor information
- Zoom joining link
- Professional closing

## Usage

### In Admin Dashboard

1. Go to **Landing Page Registrations**
2. Filter registrations (optional)
3. Check **"Also send WhatsApp"** checkbox
4. Click **"Send Reminders"**
5. System sends both email and WhatsApp reminders

### API Usage

```javascript
// Send reminders with WhatsApp
const response = await sendLandingPageRegistrationReminders({
  token,
  registrationIds: [/* array of IDs */],
  sendWhatsApp: true, // Enable WhatsApp
});
```

## Phone Number Format

The system automatically handles:
- **Indian numbers**: 10-digit numbers (e.g., `9876543210`)
- **E.164 format**: International format (e.g., `+919876543210`)
- **Auto-normalization**: Converts to `+91XXXXXXXXXX` format

## Limitations & Best Practices

### WhatsApp Policies

1. **User Consent**: Users must have opted in to receive WhatsApp messages
2. **24-Hour Window**: Free messaging within 24 hours of user's last message
3. **Template Messages**: Required for initial messages outside 24-hour window
4. **Rate Limits**: 
   - Sandbox: Limited to test numbers
   - Production: Based on your WhatsApp Business Account tier

### Best Practices

1. **Test First**: Always test with sandbox before production
2. **User Consent**: Ensure users have consented to WhatsApp communications
3. **Message Content**: Keep messages concise and valuable
4. **Error Handling**: Monitor failed messages and retry if needed
5. **Cost Management**: Monitor usage to avoid unexpected charges

## Troubleshooting

### Common Issues

1. **"Missing Twilio credentials"**
   - Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set in Supabase secrets

2. **"Invalid phone number format"**
   - Ensure phone numbers are in correct format (10 digits for India, or E.164)
   - Check that phone numbers are stored correctly in database

3. **"WhatsApp message failed"**
   - Verify the recipient number is in the sandbox (for testing)
   - Check Twilio Console for error details
   - Ensure you have sufficient Twilio credits

4. **"Message not delivered"**
   - User may not have WhatsApp installed
   - Number may not be registered with WhatsApp
   - Check Twilio logs for delivery status

### Testing

1. **Test with Sandbox**
   ```bash
   # Test the WhatsApp function directly
   curl -X POST https://your-project.supabase.co/functions/v1/send-whatsapp \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "to": "+919876543210",
       "message": "Test message"
     }'
   ```

2. **Check Twilio Console**
   - Go to Twilio Console → Logs → Messaging
   - View message status and delivery reports

## Support

- **Twilio Documentation**: [https://www.twilio.com/docs/whatsapp](https://www.twilio.com/docs/whatsapp)
- **Twilio Support**: [https://support.twilio.com](https://support.twilio.com)
- **WhatsApp Business API**: [https://www.whatsapp.com/business/api](https://www.whatsapp.com/business/api)

## Next Steps

1. ✅ Set up Twilio account
2. ✅ Add environment variables to Supabase
3. ✅ Test with sandbox numbers
4. ⏳ Apply for WhatsApp Business Profile (for production)
5. ⏳ Create message templates (for production)
6. ⏳ Deploy to production

---

**Note**: WhatsApp reminders are optional and can be enabled/disabled per reminder batch in the admin dashboard.

