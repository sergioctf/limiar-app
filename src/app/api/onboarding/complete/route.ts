import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { athleteDateStr, isoDateOfWeekDay } from "@/lib/week";
import { ensureWeeklyPlan, loadWeeklyPlan, mondayOf, nextMondayOf } from "@/lib/weekly-plan";

export async function POST(request: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Entre novamente para concluir." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile, error: readError } = await admin
    .from("profiles").select("onboarding_completed_at").eq("id", user.id).single();
  if (readError || !profile) {
    return NextResponse.json({ error: "Não foi possível carregar seu perfil. Tente novamente." }, { status: 503 });
  }
  if (profile.onboarding_completed_at) return NextResponse.json({ ok: true });

  const body = await request.json().catch(() => null);
  let firstSession: { week: string; day: string } | null = null;
  if (body?.skip !== true) {
    const now = new Date();
    const today = athleteDateStr(now);
    for (const week of [mondayOf(now), nextMondayOf(now)]) {
      await ensureWeeklyPlan(admin, user.id, week);
      // Confirm persistence, including a retry after another request created the plan.
      const { plan, reportId } = await loadWeeklyPlan(admin, user.id, week);
      const first = plan?.days.find(day => (day.type !== "rest" || day.strength)
        && (isoDateOfWeekDay(week, day.day) ?? "") >= today);
      if (reportId && first) {
        firstSession = { week, day: first.day };
        break;
      }
    }
    if (!firstSession) {
      return NextResponse.json({ error: "Ainda não encontramos um treino para os próximos dias. Confira suas preferências e tente novamente." }, { status: 422 });
    }
  }

  const { error } = await admin.from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível concluir. Tente novamente." }, { status: 503 });
  return NextResponse.json({ ok: true, firstSession });
}
