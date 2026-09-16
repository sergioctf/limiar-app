/**
 * Authorization for cron and admin endpoints.
 *
 * These routes act with the service-role client on behalf of every user — they
 * send pushes, rewrite plans and read across accounts — so the check guarding
 * them has to be worth something.
 *
 * Previously a literal string was accepted as a universal bypass, and it was
 * also embedded in two client components' error messages, which meant it
 * shipped in the browser bundle: anyone who opened devtools could trigger every
 * cron. The secrets now come from the environment only.
 */
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/** Constant-time compare, so a wrong guess leaks nothing through timing. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function authorize(request: NextRequest, secret: string | undefined): boolean {
  // No secret configured: allowed in local development, never in production.
  if (!secret) return process.env.NODE_ENV !== "production";

  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  const header = request.headers.get("authorization");
  if (header && safeEqual(header, `Bearer ${secret}`)) return true;

  // Query form, for triggering a job by hand.
  const query = request.nextUrl.searchParams.get("secret");
  return !!query && safeEqual(query, secret);
}

/** Scheduled jobs — authenticated with CRON_SECRET. */
export function authorizeCron(request: NextRequest): boolean {
  return authorize(request, process.env.CRON_SECRET);
}

/**
 * Maintenance endpoints — authenticated with ADMIN_SECRET, falling back to
 * CRON_SECRET so a project with only one configured still works.
 */
export function authorizeAdmin(request: NextRequest): boolean {
  return authorize(request, process.env.ADMIN_SECRET ?? process.env.CRON_SECRET);
}
