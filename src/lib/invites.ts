/**
 * Signup invite validation — server-side only.
 *
 * The access code used to live in the client bundle, which meant it was visible
 * to anyone who opened DevTools. Codes now live in the database and are checked
 * here, where the value never reaches the browser.
 *
 * Degrades safely: if the invite table hasn't been created yet, it falls back to
 * SIGNUP_ACCESS_CODE (env). Signup therefore keeps working during the rollout,
 * and existing users are never affected — invites gate signup, not login.
 */
import { createAdminClient } from "@/lib/supabase/server";

export type InviteCheck =
  | { ok: true;  inviteId: string | null }
  | { ok: false; reason: "empty" | "invalid" | "expired" | "exhausted" };

/** Legacy/bootstrap code, used only when the invite table is unavailable. */
function fallbackCode(): string {
  return (process.env.SIGNUP_ACCESS_CODE ?? "Manoela Pinheiro").trim();
}

export async function validateInvite(rawCode: string): Promise<InviteCheck> {
  const code = (rawCode ?? "").trim();
  if (!code) return { ok: false, reason: "empty" };

  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("invite_codes")
      .select("id, code, max_uses, used_count, expires_at, active")
      .ilike("code", code)
      .limit(1);

    // Table missing (or unreadable) → fall back so signup isn't blocked.
    if (error) {
      return code.toLowerCase() === fallbackCode().toLowerCase()
        ? { ok: true, inviteId: null }
        : { ok: false, reason: "invalid" };
    }

    const invite = data?.[0];
    if (!invite || !invite.active) return { ok: false, reason: "invalid" };

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) {
      return { ok: false, reason: "exhausted" };
    }

    return { ok: true, inviteId: invite.id as string };
  } catch {
    return code.toLowerCase() === fallbackCode().toLowerCase()
      ? { ok: true, inviteId: null }
      : { ok: false, reason: "invalid" };
  }
}

/**
 * Record a redemption. Best-effort: a failure here must never block a signup
 * that has already been authorised.
 */
export async function redeemInvite(inviteId: string | null, email: string | null): Promise<void> {
  if (!inviteId) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("invite_codes").select("used_count").eq("id", inviteId).single();

    await admin.from("invite_codes")
      .update({ used_count: (data?.used_count ?? 0) + 1 })
      .eq("id", inviteId);

    await admin.from("invite_redemptions").insert({ invite_id: inviteId, email });
  } catch { /* auditing is not worth failing a signup over */ }
}

export const INVITE_MESSAGES: Record<Exclude<InviteCheck, { ok: true }>["reason"], string> = {
  empty:     "Informe o código de convite.",
  invalid:   "Código de convite inválido.",
  expired:   "Este convite expirou.",
  exhausted: "Este convite já atingiu o limite de usos.",
};
