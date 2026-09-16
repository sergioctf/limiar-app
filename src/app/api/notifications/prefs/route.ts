/**
 * GET /api/notifications/prefs  → which notifications this athlete wants
 * PUT /api/notifications/prefs  → change them
 *
 * Merged over what is stored rather than replaced, so a client that only knows
 * about three of the four kinds cannot silently reset the fourth.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeNotificationPrefs, DEFAULT_NOTIFICATION_PREFS,
} from "@/lib/notification-prefs";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await supabase
      .from("profiles").select("notification_prefs").eq("id", user.id).single();
    return NextResponse.json({ prefs: normalizeNotificationPrefs(data?.notification_prefs) });
  } catch {
    // Column not created yet — everything is on, which is the default anyway.
    return NextResponse.json({ prefs: DEFAULT_NOTIFICATION_PREFS });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);

  let stored: unknown = null;
  try {
    const { data } = await supabase
      .from("profiles").select("notification_prefs").eq("id", user.id).single();
    stored = data?.notification_prefs ?? null;
  } catch { /* column may not exist yet */ }

  const prefs = normalizeNotificationPrefs({
    ...normalizeNotificationPrefs(stored),
    ...(body && typeof body === "object" ? body : {}),
  });

  const { error } = await supabase
    .from("profiles").update({ notification_prefs: prefs }).eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar. A coluna notification_prefs existe?" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, prefs });
}
