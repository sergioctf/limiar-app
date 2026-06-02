/**
 * POST /api/coach/full-analysis
 *
 * Comprehensive AI analysis using all runs, activities, and performance tests.
 * Saves result as a coach_report with period_type='general'.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { computeMetrics, paceToString, timeToString } from "@/lib/performance";
import { secondsToPaceString, secondsToReadable } from "@/lib/utils";
import type { Run, Activity, Goal } from "@/types";
import type { PerformanceTest } from "@/types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getGroqKey(): string | undefined {
  const rawKey = process.env.GROQ_API_KEY ?? "";
  return (rawKey.charCodeAt(0) === 65279 ? rawKey.slice(1) : rawKey).trim() || undefined;
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = getGroqKey();
  if (!apiKey) {
    console.warn("[full-analysis] GROQ_API_KEY not set");
    return null;
  }

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        max_tokens: 1500,
        temperature: 0.65,
      }),
    });

    if (!res.ok) {
      console.error("[full-analysis] Groq error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any).choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error("[full-analysis] fetch error:", err);
    return null;
  }
}

function fmtTest(t: PerformanceTest): string {
  const pace = paceToString(t.time_seconds / t.distance_km);
  const hr   = t.avg_hr ? ` FC média ${t.avg_hr} bpm` : "";
  const vdot = t.vdot   ? ` VDOT ${t.vdot.toFixed(1)}` : "";
  return `${t.test_date}: ${t.distance_km}km em ${timeToString(t.time_seconds)} (${pace}/km)${hr}${vdot}`;
}

function fmtRun(r: Run): string {
  const pace  = r.avg_pace_seconds_per_km
    ? secondsToPaceString(r.avg_pace_seconds_per_km) + "/km"
    : "—";
  const hr    = r.avg_hr ? ` FC ${r.avg_hr} bpm` : "";
  const notes = r.notes  ? ` | "${r.notes}"`      : "";
  return `${r.date}: ${r.distance_km.toFixed(1)} km | ${secondsToReadable(r.duration_seconds)} | ${pace}${hr} [${r.type}]${notes}`;
}

export async function POST(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Fetch everything in parallel
  const [
    { data: allRuns },
    { data: activities },
    { data: performanceTests },
    { data: goals },
  ] = await Promise.all([
    admin
      .from("runs")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(300),
    admin
      .from("activities")
      .select("id, name, sport_type, date, duration_seconds, calories, avg_hr")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(200),
    admin
      .from("performance_tests")
      .select("*")
      .eq("user_id", user.id)
      .order("test_date", { ascending: true })
      .catch(() => ({ data: [] })),
    admin
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "upcoming"])
      .order("race_date", { ascending: true })
      .limit(3),
  ]);

  const runs       = (allRuns    ?? []) as Run[];
  const acts       = (activities ?? []) as Activity[];
  const tests      = ((performanceTests as unknown) ?? []) as PerformanceTest[];
  const activeGoals = (goals ?? []) as Goal[];

  // ── Build context ────────────────────────────────────────────────────────────

  // Performance tests block
  const testsBlock = tests.length > 0
    ? `TESTES DE PERFORMANCE (${tests.length} testes, ordem cronológica):\n${tests.map(fmtTest).join("\n")}`
    : "TESTES DE PERFORMANCE: Nenhum teste registrado ainda.";

  // Latest test metrics
  let latestMetricsBlock = "";
  if (tests.length > 0) {
    const latest = tests[tests.length - 1]; // sorted ascending so last = newest
    const m = computeMetrics(
      latest.distance_km * 1000,
      latest.time_seconds,
      latest.avg_hr ?? undefined
    );
    latestMetricsBlock = `
MÉTRICAS DO ÚLTIMO TESTE (${latest.test_date}):
- VDOT / VO2max estimado: ${m.vdot.toFixed(1)} ml/kg/min
- LTHR estimado: ${m.lthr} bpm | HRmax estimado: ${m.hrmax_estimate} bpm
- Ritmos de treino:
${m.paces.map(p => `  ${p.label}: ${paceToString(p.pace_max_sec)} – ${paceToString(p.pace_min_sec)}/km`).join("\n")}
- Previsões de corrida:
${m.predictions.map(p => `  ${p.distance_label}: ${timeToString(p.predicted_seconds)}`).join("\n")}
`.trim();
  }

  // Last 90 days of running
  const cutoff90 = new Date();
  cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoffStr = cutoff90.toISOString().slice(0, 10);
  const recent90 = runs.filter(r => r.date >= cutoffStr);

  const totalKm90  = recent90.reduce((s, r) => s + r.distance_km, 0);
  const totalSess  = recent90.length;
  const weeks90    = 13; // ~90 days
  const avgKmWeek  = totalKm90 / weeks90;

  // Zone distribution (rough, based on avg_hr vs estimated LTHR)
  let zoneDistBlock = "";
  if (tests.length > 0) {
    const lastTest = tests[tests.length - 1];
    if (lastTest.avg_hr) {
      const lthr = Math.round(lastTest.avg_hr * 0.925);
      const runsWithHr = recent90.filter(r => r.avg_hr);
      const z1 = runsWithHr.filter(r => (r.avg_hr ?? 0) < lthr * 0.81).length;
      const z2 = runsWithHr.filter(r => { const h = r.avg_hr ?? 0; return h >= lthr * 0.81 && h <= lthr * 0.89; }).length;
      const z3 = runsWithHr.filter(r => { const h = r.avg_hr ?? 0; return h >= lthr * 0.90 && h <= lthr * 0.93; }).length;
      const z4 = runsWithHr.filter(r => { const h = r.avg_hr ?? 0; return h >= lthr * 0.94 && h <= lthr * 0.99; }).length;
      const z5 = runsWithHr.filter(r => (r.avg_hr ?? 0) >= lthr).length;
      zoneDistBlock = `
DISTRIBUIÇÃO DE ZONAS (últimas 90 dias, corridas com FC registrada: ${runsWithHr.length}):
- Z1 Recuperação (<${Math.round(lthr*0.81)} bpm): ${z1} corridas
- Z2 Aeróbico (${Math.round(lthr*0.81)}–${Math.round(lthr*0.89)} bpm): ${z2} corridas
- Z3 Moderado (${Math.round(lthr*0.90)}–${Math.round(lthr*0.93)} bpm): ${z3} corridas
- Z4 Limiar (${Math.round(lthr*0.94)}–${Math.round(lthr*0.99)} bpm): ${z4} corridas
- Z5 VO2max (≥${lthr} bpm): ${z5} corridas
`.trim();
    }
  }

  // Gym sessions count
  const gymSessions = acts.filter(a =>
    ["WeightTraining", "Workout", "Crossfit"].includes(a.sport_type)
  ).length;

  // Goals context
  const goalsBlock = activeGoals.length > 0
    ? `METAS ATIVAS:\n${activeGoals.map(g => `- ${g.race_name} (${g.distance_km}km)${g.race_date ? ` em ${g.race_date}` : ""}`).join("\n")}`
    : "METAS ATIVAS: Nenhuma meta cadastrada.";

  // ── Prompts ──────────────────────────────────────────────────────────────────

  const systemPrompt = `
Você é um treinador de corrida especialista. Analise profundamente o histórico completo deste atleta.
Baseie-se nos testes de 3km, progressão de VDOT, distribuição de treinos nas zonas de FC, e histórico completo.
Seja específico, use os dados reais, evite generalismos.
Estruture sua análise exatamente assim:
1) Nível atual e evolução
2) Distribuição de carga por zona (análise crítica)
3) Pontos fortes identificados nos dados
4) Gargalo principal que limita a evolução
5) Plano detalhado para as próximas 8 semanas com sessões específicas
6) Previsões de performance para a próxima corrida
Escreva em português brasileiro. Tom profissional e direto.
`.trim();

  const userPrompt = `
${testsBlock}

${latestMetricsBlock}

ÚLTIMOS 90 DIAS DE TREINO:
Total: ${totalKm90.toFixed(1)} km em ${totalSess} sessões (média ${avgKmWeek.toFixed(1)} km/semana)
${recent90.slice(0, 60).map(fmtRun).join("\n")}

${zoneDistBlock}

Sessões de academia/força (total): ${gymSessions}

${goalsBlock}
`.trim();

  const analysis = await callGroq(systemPrompt, userPrompt);

  if (!analysis) {
    return NextResponse.json(
      { error: "AI generation failed. Check GROQ_API_KEY." },
      { status: 422 }
    );
  }

  // Save as coach_report (period_type = 'general')
  const today = new Date().toISOString().slice(0, 10);
  const { data: report, error: dbError } = await admin
    .from("coach_reports")
    .insert({
      user_id:      user.id,
      title:        `Análise completa — ${today}`,
      report_date:  today,
      period_type:  "general",
      summary:      analysis.slice(0, 1000),
      full_report:  analysis,
    })
    .select("*")
    .single();

  if (dbError) {
    console.error("[full-analysis] DB insert error:", dbError);
    return NextResponse.json({ analysis, saved: false });
  }

  return NextResponse.json({ analysis, saved: true, report });
}
