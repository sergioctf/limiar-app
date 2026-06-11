/**
 * Limiar push notification helper — wraps web-push.
 * Only runs server-side (Node.js runtime).
 */
import webpush from "web-push";

let configured = false;

/** Strip BOM (U+FEFF) and whitespace — PowerShell pipe injects these */
function stripBom(s: string): string {
  return (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s).trim();
}

function configure() {
  if (configured) return;
  const publicKey  = stripBom(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
  const privateKey = stripBom(process.env.VAPID_PRIVATE_KEY ?? "");
  const email      = stripBom(process.env.VAPID_EMAIL ?? "mailto:admin@limiar.app");

  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not configured — push disabled");
    return;
  }

  try {
    webpush.setVapidDetails(email, publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error("[push] setVapidDetails failed:", err, { email, publicKeyLen: publicKey.length });
  }
}

export interface PushPayload {
  title:    string;
  body:     string;
  url?:     string;
  tag?:     string;
  icon?:    string;
  actions?: Array<{ action: string; title: string }>;
}

export interface PushSubscriptionRecord {
  endpoint:   string;
  p256dh_key: string;
  auth_key:   string;
}

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false on failure (expired subscriptions return false).
 */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<boolean> {
  configure();
  if (!configured) return false;

  const pushSub: webpush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh_key,
      auth:   subscription.auth_key,
    },
  };

  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
    return true;
  } catch (err: unknown) {
    // 410 Gone = subscription expired/unsubscribed
    if (err && typeof err === "object" && "statusCode" in err) {
      const code = (err as { statusCode: number }).statusCode;
      if (code === 410 || code === 404) return false;
    }
    console.error("[push] sendNotification error:", err);
    return false;
  }
}

/**
 * Send to all subscriptions for a user. Removes expired ones from DB.
 */
export async function sendPushToUser(
  admin: { from: (table: string) => unknown },
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  let sent = 0, removed = 0;
  for (const sub of subs) {
    const ok = await sendPush(sub as PushSubscriptionRecord, payload);
    if (ok) {
      sent++;
    } else {
      // Remove expired subscription
      await db.from("push_subscriptions").delete().eq("id", sub.id);
      removed++;
    }
  }

  return { sent, removed };
}
