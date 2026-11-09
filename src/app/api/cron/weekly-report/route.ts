/**
 * GET /api/cron/weekly-report
 *
 * Cron automático — executa toda segunda-feira às 10:00 UTC (07:00 BRT).
 * Para cada usuário:
 *   1. Avisa que a semana fechou (a devolutiva é determinística, na tela do Treinador)
 *   2. Gera o PLANO DA SEMANA ATUAL pelo motor (ensureWeeklyPlan), se ainda não existe
 *
 * Protegido por CRON_SECRET (Vercel injeta o header automaticamente) ou ?secret=$CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { withJobReceipt } from "@/lib/job-run";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureWeeklyPlan } from "@/lib/weekly-plan";
import { detectPatterns } from "@/lib/patterns";
import { sendPushToUser } from "@/lib/push";
import { adaptMacroPlanForUser } from "@/lib/macro-plan";
import type { Run } from "@/types";
import { authorizeCron } from "@/lib/cron-auth";

// 5 minutes — enough for multiple users + AI calls
/*
  Nunca prerenderizar.

  Sem isto o `next build` tenta gerar a rota estaticamente, executa o handler
  e ele estoura em `request.headers`. O Next engolia esse erro — até o recibo
  de `job_runs` começar a registrá-lo, e a build passar a gravar execuções
  falsas no banco a partir da máquina de quem compila (09/11).
*/
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const day = new Date(d);
  const dow = (day.getDay() + 6) % 7; // 0=Mon … 6=Sun
  day.setDate(day.getDate() - dow);
  day.setHours(0, 0, 0, 0);
  return day;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Per-user processing ──────────────────────────────────────────────────────

async function processUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  now: Date,
): Promise<{ userId: string; summary: string; plan: string; patterns: string }> {
  const thisMonday    = getMondayOf(now);
  const lastMonday    = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday    = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate() - 1);
  const thisMondayStr = toDateStr(thisMonday);
  const lastMondayStr = toDateStr(lastMonday);
  const lastSundayStr = toDateStr(lastSunday);

  // ── 1. Close last week ─────────────────────────────────────────────────────
  /*
   * Nothing is generated here any more.
   *
   * This asked a model for a summary of last week and saved it as the week
   * report — the same row the plan lives in, so a summary would have
   * overwritten the plan. It never did, because the guard always found the
   * plan's own `summary` and skipped: the weekly summary was dead code that
   * cost an LLM call's worth of risk and produced nothing (dívida A1).
   *
   * The recap is deterministic now and is computed on the Treinador screen
   * (`weekRecap`): como foi a semana, o que o treinador entendeu, o que muda.
   * The cron only points the athlete at it.
   */
  let summaryStatus = "recap-on-screen";

  const { data: lastWeekRuns } = await admin
    .from("runs").select("distance_km")
    .eq("user_id", userId)
    .gte("date", lastMondayStr).lte("date", lastSundayStr)
    .is("deleted_at", null);

  if (lastWeekRuns && lastWeekRuns.length > 0) {
    const totalKm = (lastWeekRuns as Array<{ distance_km: number | null }>)
      .reduce((sum, r) => sum + Number(r.distance_km ?? 0), 0);
    sendPushToUser(admin, userId, {
      title: "Sua semana fechou 📊",
      body:  `${lastWeekRuns.length} ${lastWeekRuns.length === 1 ? "corrida" : "corridas"}, ${totalKm.toFixed(1)} km. Veja o que o treinador entendeu e o que muda nesta semana.`,
      url:   "/coach",
      tag:   "limiar-weekly-summary",
      icon:  "/limiar_icone_app.png",
    }).catch(() => {});
  } else {
    summaryStatus = "no-runs-last-week";
  }

  // ── 2. Generate this week's plan ───────────────────────────────────────────
  /*
   * The engine writes the plan; the cron only asks for it (ADR-02).
   *
   * It used to call an LLM for a structured plan, which `ensureWeeklyPlan`
   * then accepted as usable and never replaced — an athlete without runs in
   * the last 60 days got a model-invented week, frozen for seven days. Going
   * through `ensureWeeklyPlan` means the Monday cron, the freshness banner and
   * the button all produce the same plan and respect the same freeze.
   */
  let planStatus = "skipped";
  try {
    const result = await ensureWeeklyPlan(admin, userId, thisMondayStr);
    const trainingDays = result.plan?.days.filter(d => d.type !== "rest").length ?? 0;
    planStatus = result.frozen ? "frozen"
      : result.cached ? "already-exists"
        : result.plan ? `generated (${trainingDays} training days)`
          : `failed: ${result.error ?? "sem plano"}`;
  } catch (err) {
    planStatus = `failed: ${err instanceof Error ? err.message : "erro"}`;
  }

  // ── 3. Detect patterns & save as athlete_notes ───────────────────────────
  let patternsStatus = "skipped";

  try {
    // Fetch ALL runs for pattern analysis
    const { data: allRunsForPatterns } = await admin
      .from("runs")
      .select("id, date, distance_km, duration_seconds, type, avg_pace_seconds_per_km, deleted_at")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (allRunsForPatterns && allRunsForPatterns.length > 0) {
      const detected = detectPatterns(allRunsForPatterns as Run[], thisMondayStr);

      if (detected.length > 0) {
        // Load recent pattern keys to avoid duplicates (last 30 days)
        const thirtyDaysAgo = toDateStr(new Date(now.getTime() - 30 * 86400000));
        const { data: recentNotes } = await admin
          .from("athlete_notes")
          .select("content")
          .eq("user_id", userId)
          .eq("source", "pattern_detector")
          .gte("created_at", thirtyDaysAgo + "T00:00:00Z");

        const existingContents = new Set(
          (recentNotes ?? []).map((n: { content: string }) => n.content)
        );

        const toInsert = detected.filter(p => !existingContents.has(p.content));

        if (toInsert.length > 0) {
          await admin.from("athlete_notes").insert(
            toInsert.map(p => ({
              user_id:  userId,
              category: p.category,
              content:  p.content,
              source:   "pattern_detector",
              active:   true,
            }))
          );
          patternsStatus = `${toInsert.length} pattern(s) saved: ${toInsert.map(p => p.key).join(", ")}`;
        } else {
          patternsStatus = "all already saved";
        }
      } else {
        patternsStatus = "none detected";
      }
    }
  } catch (err) {
    patternsStatus = `error: ${err instanceof Error ? err.message : "unknown"}`;
  }

  return { userId, summary: summaryStatus, plan: planStatus, patterns: patternsStatus };
}

// ─── Route handler ────────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now   = new Date();
  const admin = createAdminClient();

  // Get all user IDs from profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("id");

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, message: "No users found", results: [] });
  }

  const results = [];
  for (const profile of profiles) {
    try {
      const result = await processUser(admin, profile.id as string, now);
      results.push(result);
    } catch (err) {
      results.push({ userId: profile.id as string, error: err instanceof Error ? err.message : "unknown", summary: "error", plan: "error", patterns: "error" });
    }

    // Auto-adapt the long-term macro plan to last week's real execution
    try {
      await adaptMacroPlanForUser(admin, profile.id as string);
    } catch {
      // best-effort — never fail the weekly report over this
    }
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), results });
}

/*
  O recibo desta execução vai para `job_runs`.

  Este app nunca sofreu de exceção não capturada — sofreu de trabalho que
  simplesmente não acontecia, calado, por meses. O invólucro existe para que a
  pergunta "o cron rodou?" tenha resposta (dívida A5, `src/lib/job-run.ts`).
*/
export const GET = withJobReceipt("weekly-report", handler);
