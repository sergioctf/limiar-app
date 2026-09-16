/**
 * The Strava push subscription — the piece that makes syncing automatic.
 *
 * The webhook route has always existed and always handled create/update/delete
 * correctly. What never existed was the call that tells Strava to send those
 * events: a receiver with no sender. Activities only appeared when someone hit
 * sync by hand, which is exactly the behaviour this removes.
 *
 * A subscription is per *application*, not per athlete: one registration covers
 * every connected account, and Strava rejects a second one with 400. So the
 * only safe operation is "make sure exactly one exists, pointing at us".
 */

const API = "https://www.strava.com/api/v3/push_subscriptions";

export interface Subscription {
  id: number;
  callback_url: string;
}

interface Credentials {
  clientId: string;
  clientSecret: string;
  verifyToken: string;
}

export function stravaCredentials(): Credentials | null {
  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const verifyToken  = process.env.STRAVA_VERIFY_TOKEN;
  if (!clientId || !clientSecret || !verifyToken) return null;
  return { clientId, clientSecret, verifyToken };
}

/** A base URL Strava could actually reach. */
function isPublic(url: string | undefined | null): url is string {
  if (!url) return false;
  return /^https:\/\//.test(url) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
}

/**
 * Where Strava should deliver events.
 *
 * `NEXT_PUBLIC_APP_URL` is set to localhost for development, and nothing
 * stopped that value from being handed to Strava in production — which is
 * exactly what happened: the subscription was rejected with an opaque 400
 * because the callback pointed at a machine Strava cannot reach.
 *
 * So a localhost value is treated as absent, and the deployment's own domain
 * takes over. Vercel provides it without anyone having to configure anything.
 */
export function callbackUrl(baseUrl?: string): string | null {
  const candidates = [
    baseUrl,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ];

  const base = candidates.find(isPublic);
  return base ? `${base.replace(/\/+$/, "")}/api/strava/webhook` : null;
}

export async function listSubscriptions(c: Credentials): Promise<Subscription[]> {
  const url = `${API}?client_id=${encodeURIComponent(c.clientId)}&client_secret=${encodeURIComponent(c.clientSecret)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Strava listou assinaturas com ${res.status}`);
  return (await res.json()) as Subscription[];
}

export async function deleteSubscription(c: Credentials, id: number): Promise<void> {
  const url = `${API}/${id}?client_id=${encodeURIComponent(c.clientId)}&client_secret=${encodeURIComponent(c.clientSecret)}`;
  const res = await fetch(url, { method: "DELETE" });
  // 404 means it is already gone, which is the state we wanted anyway.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Strava recusou remover a assinatura ${id}: ${res.status}`);
  }
}

export async function createSubscription(c: Credentials, callback: string): Promise<Subscription> {
  const body = new URLSearchParams({
    client_id:     c.clientId,
    client_secret: c.clientSecret,
    callback_url:  callback,
    verify_token:  c.verifyToken,
  });

  const res = await fetch(API, { method: "POST", body });
  if (!res.ok) {
    // Strava validates by calling our GET endpoint before replying, so a
    // failure here usually means the callback is unreachable or the verify
    // token does not match — worth saying out loud rather than swallowing.
    throw new Error(`Strava recusou a assinatura (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as Subscription;
}

export type EnsureResult =
  | { status: "already"; subscription: Subscription }
  | { status: "created"; subscription: Subscription }
  | { status: "replaced"; subscription: Subscription; removed: number[] };

/**
 * Guarantee exactly one subscription, pointing at this deployment.
 *
 * Idempotent on purpose: it runs on a schedule, and a subscription silently
 * pointing at a previous deployment URL is indistinguishable from no
 * subscription at all — activities simply stop arriving and nobody is told.
 */
export async function ensureSubscription(
  c: Credentials, callback: string,
): Promise<EnsureResult> {
  const existing = await listSubscriptions(c);

  const correct = existing.find(s => s.callback_url === callback);
  if (correct && existing.length === 1) {
    return { status: "already", subscription: correct };
  }

  const stale = existing.filter(s => s.callback_url !== callback);
  for (const s of stale) await deleteSubscription(c, s.id);

  if (correct) return { status: "replaced", subscription: correct, removed: stale.map(s => s.id) };

  const created = await createSubscription(c, callback);
  return stale.length > 0
    ? { status: "replaced", subscription: created, removed: stale.map(s => s.id) }
    : { status: "created", subscription: created };
}
