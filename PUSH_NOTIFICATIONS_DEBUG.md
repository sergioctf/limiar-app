# Push Notifications Debugging Guide

## Overview

Limiar uses Web Push API with VAPID keys for sending notifications at scheduled times (05:30h and 22:00h BRT).

## Architecture

### Client Flow
1. **User clicks "Ativar notificações"** in Settings
2. Browser requests permission via `Notification.requestPermission()`
3. Service worker (`/public/sw.js`) is registered
4. Browser subscribes to push via `PushManager.subscribe()`
5. Client sends subscription to **POST /api/push/subscribe**

### Server Flow
1. **API saves subscription** to `push_subscriptions` table
2. **Welcome notification** is sent immediately (fire-and-forget)
3. **Cron jobs** send notifications at scheduled times:
   - **05:30h BRT**: Morning plan via `/api/cron/notify-morning`
   - **22:00h BRT**: Evening plan via `/api/cron/notify-evening`

## 🐛 Common Issues & Solutions

### Issue 1: "The string contains invalid characters"
**Symptom**: Error when clicking "Ativar notificações"

**Root Cause**: VAPID key contaminated with BOM (Byte Order Mark) from PowerShell

**Status**: ✅ FIXED
- Added `stripBom()` function in `src/lib/push.ts`
- Cleans keys on server-side initialization

**Action**: Restart dev server to reload environment variables

### Issue 2: `push_subscriptions` table doesn't exist
**Symptom**: Subscription saved but notifications never arrive

**Root Cause**: Missing database table

**Status**: ✅ FIXED (Dec 2024)
- Added schema to `supabase/schema.sql`
- Created setup endpoint `/api/admin/setup-phase3`

**Action**: Run setup endpoint to create table
```bash
curl "http://localhost:3001/api/admin/setup-phase3?secret=limiar_admin_2026"
```

### Issue 3: Service Worker not registered
**Symptom**: `PushManager.subscribe()` fails with "Service Worker not ready"

**Debug**: Open DevTools Console
```javascript
navigator.serviceWorker.ready.then(reg => {
  console.log("✓ Service Worker ready:", reg);
});
```

**Fix**: Check `/public/sw.js` exists and is accessible
```bash
curl -I http://localhost:3001/sw.js
```

### Issue 4: Permission denied
**Symptom**: Browser shows "Permissão negada" after enabling

**Debug**: Check browser notification settings
```javascript
console.log("Permission:", Notification.permission); // "default", "granted", or "denied"
```

**Fix**: Allow notifications in browser settings
- Chrome: Settings → Privacy and security → Site settings → Notifications
- Firefox: Preferences → Privacy → Permissions → Notifications

### Issue 5: Subscription not persisting
**Symptom**: Notification button shows "Ativar" every time

**Debug**: Check if subscription saved to DB
```sql
-- In Supabase SQL Editor
SELECT * FROM push_subscriptions WHERE user_id = '<your-user-id>';
```

**Fix**: Check RLS policies allow insert
```sql
-- List all policies
SELECT * FROM pg_policies WHERE tablename='push_subscriptions';
```

## 🔧 Testing Steps

### 1. Setup Database
```bash
# In Supabase project
curl "http://localhost:3001/api/admin/setup-phase3?secret=limiar_admin_2026"
```

### 2. Enable Notifications (UI)
- Navigate to `/settings`
- Click "Ativar notificações push"
- Grant permission when prompted
- Should see "Notificações ativas — 05:30h e 22:00h (BRT)"

### 3. Verify Subscription Saved
```sql
-- In Supabase SQL Editor
SELECT id, user_id, endpoint, created_at 
FROM push_subscriptions 
ORDER BY created_at DESC 
LIMIT 1;
```

### 4. Check Console Logs (DevTools)
```javascript
// These should appear when enabling notifications:
"[Push] Requesting permission..."
"[Push] Permission result: granted"
"[Push] Registering SW & subscribing..."
"[Push] Subscribed to: https://fcm.googleapis.com/fcm/send/..."
"[Push] Success!"
```

### 5. Test Notification Sending (Server)
```bash
# Send test notification to all users
curl -X POST http://localhost:3001/api/push/send-test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "message": "Test notification from server"
  }'
```

## 📊 Database Schema

```sql
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  endpoint    text NOT NULL,           -- FCM endpoint URL
  p256dh_key  text NOT NULL,           -- Encryption key
  auth_key    text NOT NULL,           -- Authentication key
  user_agent  text,                    -- Browser info for tracking
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
```

## 🔑 Environment Variables

```env
# .env.local (must match Supabase project)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BA...     # Sent to browser
VAPID_PRIVATE_KEY=qy...                # Server-only, kept secret
VAPID_EMAIL=mailto:admin@limiar.app
```

**Generate new keys:**
```bash
npx web-push generate-vapid-keys
```

⚠️ **Warning**: If you update VAPID keys:
- Existing subscriptions become invalid
- Users need to re-enable notifications
- Test with new keys before deploying to production

## 📱 iOS Safari Special Case

iOS Safari (not standalone) doesn't support push notifications.

**Guide shown to users**: Install app to home screen first
- Share icon → "Add to Home Screen"
- Open app from home screen icon
- Then enable notifications in Settings

(Notification background delivery only works on installed PWA, not browser tab)

## 🚀 Cron Jobs (Scheduling)

Two cron jobs send automatic notifications:

### Morning (05:30h BRT)
```
GET /api/cron/notify-morning
Sends: Daily training plan
```

### Evening (22:00h BRT)
```
GET /api/cron/notify-evening
Sends: Tomorrow's plan + evening reflection prompt
```

**Setup in Vercel**: Add HTTP cron in `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/notify-morning",
      "schedule": "30 5 * * *"
    },
    {
      "path": "/api/cron/notify-evening",
      "schedule": "0 22 * * *"
    }
  ]
}
```

## 🔍 Monitoring

### Check subscription health
```sql
SELECT 
  DATE(created_at),
  COUNT(*) as subscriptions,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7_days
FROM push_subscriptions
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

### Detect expired subscriptions
Subscriptions are automatically removed when:
- Server gets 410 Gone (user unsubscribed from browser)
- Server gets 404 Not Found (FCM endpoint invalid)

## 🐛 Debugging Checklist

- [ ] Dev server running (`npm run dev`)
- [ ] VAPID keys in `.env.local` (no BOM characters)
- [ ] `push_subscriptions` table exists (run setup endpoint)
- [ ] RLS policies allow user access
- [ ] Service Worker registration succeeds
- [ ] Browser allows notifications permission
- [ ] Subscription saved to database
- [ ] Network requests successful (DevTools Network tab)
- [ ] No JavaScript errors in console
- [ ] Cron endpoint accessible from Vercel

## 📝 Code Files

- **Client**: `src/components/PushNotificationButton.tsx`
- **Server API**: `src/app/api/push/subscribe/route.ts`
- **Push utility**: `src/lib/push.ts`
- **Service Worker**: `public/sw.js`
- **Cron: Morning**: `src/app/api/cron/notify-morning/route.ts`
- **Cron: Evening**: `src/app/api/cron/notify-evening/route.ts`
- **Schema**: `supabase/schema.sql`
- **Setup**: `src/app/api/admin/setup-phase3/route.ts`
