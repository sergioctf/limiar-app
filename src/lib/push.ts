/**
 * Limiar push notification helper — wraps web-push.
 * Only runs server-side (Node.js runtime).
 */
import webpush from "web-push";

let configured = false;
/** Why configuration failed, surfaced by the diagnose endpoint. */
let configureError: string | null = null;

/** Strip BOM (U+FEFF) and whitespace — PowerShell pipe injects these */
function stripBom(s: string): string {
  return (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s).trim();
}

const DEFAULT_SUBJECT = "mailto:admin@limiar.app";

/**
 * A VAPID subject must be a mailto: or https: URL — it becomes the JWT `sub`
 * claim, and push services reject the request outright if it's malformed.
 *
 * Env vars get mangled surprisingly often (a shell pipe once turned this into a
 * list of character codes), so anything that isn't a clean single-line address
 * falls back to the default rather than shipping a broken JWT.
 */
function normalizeSubject(raw: string): string {
  const s = raw.trim();
  if (!s) return DEFAULT_SUBJECT;

  // Must be one line, no whitespace, and a plausible mailto/https target.
  const valid =
    !/\s/.test(s) &&
    (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) || /^https?:\/\/[^\s]+$/.test(s));
  if (valid) return s;

  const bare = `mailto:${s}`;
  if (!/\s/.test(s) && /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bare)) return bare;

  console.warn("[push] VAPID_EMAIL is malformed — falling back to the default subject");
  return DEFAULT_SUBJECT;
}

function configure() {
  if (configured) return;
  const publicKey  = stripBom(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
  const privateKey = stripBom(process.env.VAPID_PRIVATE_KEY ?? "");
  const email      = normalizeSubject(stripBom(process.env.VAPID_EMAIL ?? ""));

  if (!publicKey || !privateKey) {
    configureError = `VAPID keys missing (public:${publicKey.length} private:${privateKey.length})`;
    console.warn("[push] VAPID keys not configured — push disabled");
    return;
  }

  try {
    webpush.setVapidDetails(email, publicKey, privateKey);
    configured = true;
    configureError = null;
  } catch (err) {
    configureError = err instanceof Error ? err.message : "setVapidDetails failed";
    console.error("[push] setVapidDetails failed:", err, { email, publicKeyLen: publicKey.length });
  }
}

/** Non-sensitive health snapshot of the push configuration. */
export function pushConfigHealth() {
  configured = false;          // force a fresh attempt so errors are current
  configureError = null;
  configure();

  const publicKey  = stripBom(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
  const privateKey = stripBom(process.env.VAPID_PRIVATE_KEY ?? "");
  const rawEmail   = stripBom(process.env.VAPID_EMAIL ?? "");

  return {
    configured,
    error: configureError,
    publicKeyLength:  publicKey.length,      // expect 87-88 (base64url P-256)
    privateKeyLength: privateKey.length,     // expect 43-44
    publicKeyPrefix:  publicKey.slice(0, 8), // enough to compare with the client's
    subjectRaw:       rawEmail || "(unset)",
    subjectNormalized: normalizeSubject(rawEmail),
  };
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

export interface PushSendResult {
  ok: boolean;
  /** True only for 404/410 — the push service says this endpoint is gone. */
  expired: boolean;
  statusCode?: number;
  message?: string;
}

/**
 * Send a push notification to a single subscription.
 *
 * Distinguishes a genuinely dead subscription (404/410) from a delivery or
 * configuration failure (e.g. 403 = VAPID key mismatch). Only the former means
 * the record should be deleted — conflating the two silently wipes valid
 * subscriptions and makes a config bug look like "expired".
 */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<PushSendResult> {
  configure();
  if (!configured) {
    return { ok: false, expired: false, message: configureError ?? "VAPID não configurado" };
  }

  const pushSub: webpush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh_key,
      auth:   subscription.auth_key,
    },
  };

  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
    return { ok: true, expired: false };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    const code = typeof e?.statusCode === "number" ? e.statusCode : undefined;
    const expired = code === 410 || code === 404;

    if (!expired) console.error("[push] sendNotification error:", code, e?.body ?? e?.message);

    return {
      ok: false,
      expired,
      statusCode: code,
      message: (e?.body || e?.message || "erro desconhecido").toString().slice(0, 200),
    };
  }
}

/**
 * Send to all subscriptions for a user.
 * Only subscriptions the push service reports as gone (404/410) are deleted;
 * other failures are reported back so the cause stays visible.
 */
export async function sendPushToUser(
  admin: { from: (table: string) => unknown },
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number; errors: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, removed: 0, errors: [] };

  let sent = 0, removed = 0;
  const errors: string[] = [];

  for (const sub of subs) {
    const res = await sendPush(sub as PushSubscriptionRecord, payload);
    if (res.ok) {
      sent++;
    } else if (res.expired) {
      await db.from("push_subscriptions").delete().eq("id", sub.id);
      removed++;
    } else {
      errors.push(`${res.statusCode ?? "?"}: ${res.message ?? "erro"}`);
    }
  }

  return { sent, removed, errors };
}
