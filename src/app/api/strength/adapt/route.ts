/**
 * POST /api/strength/adapt
 * body: { weekStart, day, action: "shorter" | "lighter", minutes?, forever? }
 *
 * Adaptar a sessão de musculação — o que a corrida já tinha e ela não.
 *
 * Duas escritas, como na troca de exercício: o plano guardado, para a mudança
 * ainda estar lá à noite; e, quando o atleta pede "para sempre", a duração
 * preferida em `strength_prefs`, para o gerador parar de propor uma hora toda
 * semana para quem tem quarenta minutos.
 *
 * O "para sempre" vale só para o tempo. "Mais leve" é uma decisão sobre hoje —
 * um dia ruim, uma noite mal dormida — e transformar isso em regra permanente
 * seria o motor deixando de treinar o atleta por causa de uma terça-feira.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeeklyPlan } from "@/lib/weekly-plan";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";
import { fitToMinutes, lighten } from "@/lib/strength-adapt";
import type { WeeklyPlanData } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const weekStart = typeof body?.weekStart === "string" ? body.weekStart : null;
  const day       = typeof body?.day === "string" ? body.day : null;
  const action    = body?.action === "shorter" || body?.action === "lighter" ? body.action : null;
  const minutes   = typeof body?.minutes === "number" ? Math.round(body.minutes) : null;
  const forever   = body?.forever === true;

  if (!weekStart || !day || !action) {
    return NextResponse.json({ error: "Requisição incompleta." }, { status: 400 });
  }
  if (action === "shorter" && (!minutes || minutes < 10 || minutes > 120)) {
    return NextResponse.json({ error: "Duração fora do razoável." }, { status: 400 });
  }

  const { plan, reportId } = await loadWeeklyPlan(supabase, user.id, weekStart);
  if (!plan || !reportId) {
    return NextResponse.json({ error: "Plano da semana não encontrado." }, { status: 404 });
  }

  const target = plan.days.find(d => d.day === day);
  if (!target?.strength) {
    return NextResponse.json({ error: "Não há musculação neste dia." }, { status: 404 });
  }

  target.strength = action === "shorter"
    ? fitToMinutes(target.strength, minutes as number)
    : lighten(target.strength);

  // O dia que é só musculação carrega a duração no próprio card da semana.
  if (target.sport === "musculacao" || target.type === "strength") {
    target.duration_min = target.strength.estimatedMinutes;
  }

  const updated: WeeklyPlanData = { ...plan, days: plan.days };
  const { error: planError } = await supabase
    .from("coach_reports")
    .update({ full_report: JSON.stringify(updated) })
    .eq("id", reportId).eq("user_id", user.id);

  if (planError) {
    return NextResponse.json({ error: "Não foi possível salvar a adaptação." }, { status: 500 });
  }

  /*
    Levar adiante — melhor esforço, de propósito.

    A adaptação que o atleta acabou de fazer já está salva; derrubar a
    requisição inteira porque uma preferência não gravou desfaria, aos olhos
    dele, uma mudança que está na tela.
  */
  let carriedForward = false;
  if (forever && action === "shorter" && minutes) {
    try {
      const { data } = await supabase
        .from("profiles").select("strength_prefs").eq("id", user.id).single();
      if (data?.strength_prefs) {
        const prefs = normalizeStrengthPrefs(data.strength_prefs);
        prefs.sessionMinutes = minutes;
        const { error } = await supabase
          .from("profiles")
          .update({ strength_prefs: normalizeStrengthPrefs(prefs) })
          .eq("id", user.id);
        carriedForward = !error;
      }
    } catch { /* a adaptação em si está salva */ }
  }

  return NextResponse.json({ ok: true, carriedForward, plan: updated });
}
