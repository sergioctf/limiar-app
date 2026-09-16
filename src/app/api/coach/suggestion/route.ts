/**
 * Readiness-driven plan suggestion, for the coach inbox.
 *   GET  /api/coach/suggestion          → today's pending suggestion (creates one
 *                                          when today's recovery offers a swap), or null
 *   POST /api/coach/suggestion {action}  → "accept" (swap today for an easy run) | "dismiss"
 *
 * The decision itself — is recovery low, is today hard, is the session still
 * ahead — comes from `buildRecoveryToday`, the same place the dashboard and the
 * morning notification get theirs. Accepting goes through `applySwap`, so the
 * swap made here can be undone from the dashboard like any other.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import { applySwap, easyReplacement, dayKeyOf } from "@/lib/session-swap";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const inputs = await loadRecoveryInputs(admin, user.id);
  const { today, recovery, plan } = inputs;

  // Already decided today? Don't nag.
  const { data: existing } = await admin
    .from("plan_suggestions").select("*")
    .eq("user_id", user.id).eq("date", today).eq("kind", "readiness_adjust")
    .maybeSingle();
  if (existing && existing.status !== "pending") return NextResponse.json({ suggestion: null });
  if (existing) return NextResponse.json({ suggestion: existing });

  if (!plan || !recovery.session || !recovery.offer?.options.includes("easy")) {
    return NextResponse.json({ suggestion: null });
  }

  const suggested = easyReplacement(recovery.session, plan);
  const reason = `Recuperação ${recovery.score}/100`;
  const { data: created } = await admin
    .from("plan_suggestions")
    .upsert({
      user_id: user.id, date: today, kind: "readiness_adjust",
      reason,
      message: `${recovery.advice.detail} Trocar "${recovery.session.label}" por ${suggested.label.toLowerCase()}${suggested.distance_km ? ` de ${suggested.distance_km} km` : ""}? Você decide — e dá para desfazer.`,
      original_day: recovery.session, suggested_day: suggested, status: "pending",
    }, { onConflict: "user_id,date,kind" })
    .select().single();

  return NextResponse.json({ suggestion: created });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action as "accept" | "dismiss" | undefined;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const admin = createAdminClient();
  const inputs = await loadRecoveryInputs(admin, user.id);

  const { data: sug } = await admin
    .from("plan_suggestions").select("*")
    .eq("user_id", user.id).eq("date", inputs.today).eq("kind", "readiness_adjust").eq("status", "pending")
    .maybeSingle();
  if (!sug) return NextResponse.json({ error: "Sem sugestão pendente" }, { status: 404 });

  if (action === "accept" && inputs.plan && inputs.planReportId) {
    const result = applySwap(inputs.plan, dayKeyOf(inputs.today), "easy", String(sug.reason ?? "Recuperação baixa"));
    if (!("error" in result)) {
      await admin.from("coach_reports").update({ full_report: JSON.stringify(result.plan) }).eq("id", inputs.planReportId);
    }
  }

  await admin.from("plan_suggestions")
    .update({ status: action === "accept" ? "accepted" : "dismissed" })
    .eq("id", sug.id);

  return NextResponse.json({ ok: true, action });
}
