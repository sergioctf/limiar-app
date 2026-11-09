/**
 * The advisor.
 *
 *   GET  /api/coach/advisor          → current findings (generating them if needed)
 *   POST /api/coach/advisor          → { id, action: "accept" | "dismiss" }
 *
 * Locked until the athlete has a 3 km test: every judgement here compares what
 * they are doing against calibrated intensities, and without a measured VDOT
 * the advice would be dressed-up guessing. The locked response says so and
 * explains what the test unlocks, rather than returning an empty list.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { toSportKey } from "@/lib/sports";
import { testStatus, TEST_BENEFITS, TEST_PROTOCOL } from "@/lib/test-status";
import { reconcileSuggestions, dedupeForDisplay } from "@/lib/advisor-inbox";
import {
  analyzeTraining, applyAdvisorPatch, setsPerMuscleFromLogs,
  type AdvisorFinding, type AdvisorPatch, type AdvisorInput,
} from "@/lib/advisor";
import { troubledDays } from "@/lib/day-patterns";
import { nextTarget } from "@/lib/strength-progression";
import { normalizePrefs } from "@/lib/workout-builder";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";
import { loadWeeklyPlan, mondayOf, weeklyVolumesBefore, ensureWeeklyPlan } from "@/lib/weekly-plan";
import { exerciseById } from "@/lib/exercises";
import { computeAdherenceHistory } from "@/lib/plan-adherence";
import { loadSessionActivityLinks } from "@/lib/session-activity-link-db";
import { linkedReference, sessionLinkFor } from "@/lib/session-activity-link";
import { dayStatus } from "@/lib/day-status";
import { analyzeExecution, executionPattern, type ExecutionAnalysis } from "@/lib/workout-execution";
import type { KmSplit as RunStreamSplit } from "@/lib/run-streams";
import { brtDateStr } from "@/lib/plan-notify";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import { applySwap, dayKeyOf } from "@/lib/session-swap";
import type { PerformanceTest, Race, Run, WeeklyPlanDay } from "@/types";

const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Don't re-raise a finding the athlete dismissed less than this long ago. */

interface SuggestionRow {
  id: string; finding_key: string; area: string; severity: string;
  title: string; evidence: string; proposal: string; rationale: string;
  action_label: string | null; patch: AdvisorPatch; status: string;
  week_start: string; created_at: string;
}

function lockedPayload(status: ReturnType<typeof testStatus>) {
  return NextResponse.json({
    locked: true,
    testStatus: {
      state: status.state,
      weeksSince: status.weeksSince,
      headline: status.headline,
      detail: status.detail,
    },
    benefits: TEST_BENEFITS,
    protocol: TEST_PROTOCOL,
    suggestions: [],
  });
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // ── The gate ──────────────────────────────────────────────────────────────
  const tests = await (async (): Promise<PerformanceTest[]> => {
    try {
      const { data } = await admin
        .from("performance_tests").select("*")
        .eq("user_id", user.id).order("test_date", { ascending: false }).limit(5);
      return (data ?? []) as PerformanceTest[];
    } catch {
      return [];
    }
  })();

  const status = testStatus(tests);
  if (!status.unlocks.advisor) return lockedPayload(status);

  const weekStart = mondayOf(new Date());

  // ── Everything the engine looks at ────────────────────────────────────────
  const since = new Date(); since.setDate(since.getDate() - 84);
  const sinceStr = since.toISOString().slice(0, 10);

  async function safe<T>(p: PromiseLike<{ data: T | null }>, fallback: T): Promise<T> {
    try { const { data } = await p; return data ?? fallback; } catch { return fallback; }
  }

  const [profile, runs, strengthRows, races, plan, reports, activities, links] = await Promise.all([
    safe<{ training_prefs: unknown; strength_prefs: unknown } | null>(
      admin.from("profiles").select("training_prefs, strength_prefs").eq("id", user.id).single(), null),
    safe<Run[]>(
      admin.from("runs")
        .select("id, date, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_pace_seconds_per_km, avg_hr, type")
        .eq("user_id", user.id).gte("date", sinceStr).is("deleted_at", null) as never, []),
    safe<Array<{ date: string; exercise_id: string; weight_kg: number | null; reps: number | null; rir: number | null }>>(
      admin.from("strength_logs").select("date, exercise_id, weight_kg, reps, rir")
        .eq("user_id", user.id).gte("date", sinceStr).order("date", { ascending: true }) as never, []),
    safe<Race[]>(
      admin.from("races").select("*").eq("user_id", user.id)
        .gte("date", new Date().toISOString().slice(0, 10))
        .order("date", { ascending: true }).limit(1) as never, []),
    loadWeeklyPlan(admin, user.id, weekStart).catch(() => ({ plan: null, reportId: null })),
    safe<Array<{ period_type: string; period_start: string | null; full_report: string | null }>>(
      admin.from("coach_reports").select("period_type, period_start, full_report")
        .eq("user_id", user.id).eq("period_type", "week")
        .order("period_start", { ascending: false }).limit(6) as never, []),
    safe<Array<{ id: string; date: string; sport_type: string; duration_seconds: number | null; distance_m: number | null }>>(
      admin.from("activities").select("id, date, sport_type, duration_seconds, distance_m")
        .eq("user_id", user.id).gte("date", sinceStr).is("deleted_at", null) as never, []),
    loadSessionActivityLinks(admin, user.id, sinceStr),
  ]);

  const prefs         = normalizePrefs(profile?.training_prefs);
  const strengthPrefs = profile?.strength_prefs ? normalizeStrengthPrefs(profile.strength_prefs) : null;

  // The plan is what the advisor observes — build it if this week has none.
  let planDays: WeeklyPlanDay[] = plan.plan?.days ?? [];
  if (planDays.length === 0) {
    const built = await ensureWeeklyPlan(admin, user.id, weekStart).catch(() => null);
    planDays = built?.plan?.days ?? [];
  }

  // Lift progression: top-set load, first vs last session.
  const byExercise = new Map<string, Map<string, number>>();
  for (const r of strengthRows) {
    if (r.weight_kg == null || r.weight_kg <= 0) continue;
    const dates = byExercise.get(r.exercise_id) ?? new Map<string, number>();
    dates.set(r.date, Math.max(dates.get(r.date) ?? 0, r.weight_kg));
    byExercise.set(r.exercise_id, dates);
  }
  const liftProgress: AdvisorInput["liftProgress"] = [];
  byExercise.forEach((dates, id) => {
    const points = Array.from(dates.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (points.length < 2) return;

    const sets = strengthRows.filter(r => r.exercise_id === id).map(r => ({
      date: r.date, exerciseId: id, setIndex: 1,
      weightKg: r.weight_kg, reps: r.reps ?? null, rir: r.rir ?? null,
    }));
    const ex = exerciseById(id);
    const advice = nextTarget(sets, { reps: ex?.reps ?? [8, 12], rir: 2, exerciseId: id });

    const firstSeen = new Date(`${points[0][0]}T12:00:00Z`).getTime();
    liftProgress.push({
      exerciseId: id,
      name: ex?.name ?? id,
      sessions: points.length,
      deltaKg: Math.round((points[points.length - 1][1] - points[0][1]) * 10) / 10,
      lastKg: points[points.length - 1][1],
      suggestedKg: advice.weightKg,
      weeksInPlan: Math.floor((Date.now() - firstSeen) / (7 * 86400_000)),
    });
  });

  // Sets per muscle over the last 4 weeks of logs.
  const fourWeeks = new Date(); fourWeeks.setDate(fourWeeks.getDate() - 28);
  const recentLogs = strengthRows.filter(r => r.date >= fourWeeks.toISOString().slice(0, 10));
  const loggedSetsPerMuscle = setsPerMuscleFromLogs(recentLogs, 4);

  // Prescribed vs logged strength sessions over 3 weeks.
  const threeWeeks = new Date(); threeWeeks.setDate(threeWeeks.getDate() - 21);
  const threeWeeksStr = threeWeeks.toISOString().slice(0, 10);
  const loggedDays = new Set(strengthRows.filter(r => r.date >= threeWeeksStr).map(r => r.date));
  /*
    Treinar e registrar séries são duas coisas, e o conselheiro confundia as duas.

    A agenda reconhece a musculação que chega do relógio; este cálculo olhava só
    os registros de série, repetição e carga e anunciava "nenhum treino de força
    registrado" para quem tinha ido à academia seis vezes. As duas telas
    discordavam sobre o mesmo atleta (Sérgio, 29/09).
  */
  const liftedDays = new Set(
    activities
      .filter(a => a.date >= threeWeeksStr && toSportKey(a.sport_type) === "musculacao")
      .map(a => a.date),
  );
  const strengthLogged = {
    prescribed: (strengthPrefs?.days.length ?? 0) * 3,
    logged: loggedDays.size,
    attended: liftedDays.size,
  };

  // Only weeks that actually had something scheduled in the past count.
  const scored = computeAdherenceHistory(reports, runs as never, activities, 4, links)
    .map(w => w.score)
    .filter((s): s is number => s != null);
  const adherence = scored.length >= 2
    ? scored.reduce((s, v) => s + v, 0) / scored.length / 100
    : null;

  // ── How recent sessions were actually run ─────────────────────────────────
  // Uses the splits already cached by the streams route, so this costs one
  // query and never touches Strava.
  const executionHabit = await (async () => {
    try {
      const { data: streamRows } = await admin
        .from("run_streams")
        .select("run_id, analysis, fetched_at")
        .eq("user_id", user.id)
        .order("fetched_at", { ascending: false })
        .limit(10);
      const rows = (streamRows ?? []) as Array<{
        run_id: string;
        analysis: { splits?: RunStreamSplit[] } | null;
      }>;
      if (rows.length === 0) return null;

      const { data: runRows } = await admin
        .from("runs").select("id, date").eq("user_id", user.id).is("deleted_at", null).in("id", rows.map(r => r.run_id));
      const dateById = new Map(
        ((runRows ?? []) as Array<{ id: string; date: string }>).map(r => [r.id, r.date]),
      );

      // One plan lookup per week, not per run.
      const planCache = new Map<string, WeeklyPlanDay[]>();
      const analyses: ExecutionAnalysis[] = [];

      for (const row of rows) {
        const date = dateById.get(row.run_id);
        const splits = row.analysis?.splits ?? [];
        if (!date || splits.length === 0) continue;

        const d = new Date(`${date}T12:00:00`);
        const monday = mondayOf(d);
        if (!planCache.has(monday)) {
          const loaded = await loadWeeklyPlan(admin, user.id, monday).catch(() => ({ plan: null }));
          planCache.set(monday, loaded.plan?.days ?? []);
        }
        const dayKey = DAY_KEYS[d.getDay()];
        const planned = planCache.get(monday)!.find(x => x.day === dayKey) ?? null;
        const explicit = linkedReference(sessionLinkFor(links, date, "corrida"), { kind: "run", id: row.run_id });
        const status = dayStatus({ date, planned, runs, activities: [], links });
        const assigned = status.done.some(item => item.planned && item.id === row.run_id);
        const reference = explicit === undefined ? (assigned ? planned : null) : explicit;
        if (!reference) continue;
        analyses.push(analyzeExecution(reference, splits));
      }

      return executionPattern(analyses);
    } catch {
      return null;
    }
  })();

  // Which weekday keeps needing to bend, over the last eight weeks.
  const dayTrouble = troubledDays(
    computeAdherenceHistory(reports, runs as never, activities, 8, links),
    new Date().toISOString().slice(0, 10),
  );

  const findings = analyzeTraining({
    prefs,
    strengthPrefs,
    planDays,
    executionHabit,
    troubledDays: dayTrouble,
    weeklyKm: weeklyVolumesBefore(runs, weekStart),
    loggedSetsPerMuscle,
    liftProgress,
    strengthLogged,
    nextRace: races[0] ?? null,
    adherence,
  });

  // ── Persist, respecting past dismissals ───────────────────────────────────
  const existing = await safe<SuggestionRow[]>(
    admin.from("advisor_suggestions").select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(60) as never, []);

  /*
   * One row per open finding, refreshed — not one per week.
   *
   * The de-duplication used to be scoped to `week_start`, so a condition the
   * athlete had not acted on grew a copy every time the advisor ran. Five
   * identical cards for the same split problem is not five problems, but the
   * inbox presented it as though it were.
   */
  const { toInsert, toUpdate } = reconcileSuggestions(
    findings as never, existing as never, weekStart,
  );

  let storageReady = true;
  if (toInsert.length > 0) {
    const { error } = await admin
      .from("advisor_suggestions")
      .insert(toInsert.map(row => ({ ...row, user_id: user.id })));
    if (error) storageReady = false;
  }
  for (const u of toUpdate) {
    // Refreshing in place keeps the evidence current — "15 sessões prescritas"
    // becomes 18 next week, and a stale card is its own kind of wrong.
    const { error } = await admin
      .from("advisor_suggestions")
      .update({ ...u.values, updated_at: new Date().toISOString() })
      .eq("id", u.id).eq("user_id", user.id);
    if (error) storageReady = false;
  }

  // When the table isn't there yet, still show the findings — read-only.
  if (!storageReady) {
    return NextResponse.json({
      locked: false,
      storageReady: false,
      testStatus: { state: status.state, weeksSince: status.weeksSince, headline: status.headline, detail: status.detail },
      suggestions: findings.map((f, i) => ({
        id: `local-${i}`, ...toApi(f), status: "pending" as const,
      })),
    });
  }

  const fresh = await safe<SuggestionRow[]>(
    admin.from("advisor_suggestions").select("*")
      .eq("user_id", user.id).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(20) as never, []);

  /*
   * A finding stops applying once the situation it describes is gone — and the
   * inbox never shows the same finding twice, however many rows an athlete
   * accumulated before the write path was fixed.
   */
  const liveKeys = new Set(findings.map(f => f.key));

  /*
    Fecha o que deixou de valer.

    Um achado termina de três formas: o atleta aplica, o atleta dispensa, ou —
    de longe a mais comum — **o problema simplesmente acaba**, porque ele moveu
    a sessão de dia ou passou a registrar as séries. Faltava esse terceiro
    estado, e a linha ficava `pending` para sempre: a notificação semanal lia
    essas linhas e podia avisar sobre um conflito que não existe mais.

    Melhor esforço, como o resto da persistência daqui: se a migration 038 (o
    status `resolved`) ainda não rodou, o erro é ignorado e a tela continua
    correta de qualquer forma — quem decide o que aparece é `dedupeForDisplay`.
  */
  const mortas = (fresh as unknown as SuggestionRow[])
    .filter(r => !liveKeys.has(r.finding_key))
    .map(r => r.id);
  if (mortas.length > 0) {
    await admin.from("advisor_suggestions")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .in("id", mortas).eq("user_id", user.id)
      .then(() => undefined, () => undefined);
  }

  const suggestions = dedupeForDisplay(fresh as never, liveKeys, weekStart)
    .map(r => ({
      id: r.id,
      key: r.finding_key,
      area: r.area,
      severity: r.severity,
      title: r.title,
      evidence: r.evidence,
      proposal: r.proposal,
      rationale: r.rationale,
      actionLabel: r.action_label,
      patch: r.patch,
      status: r.status,
      stale: !liveKeys.has(r.finding_key),
    }));

  // Today's readiness proposal joins the same list.
  //
  // It used to live in its own pop-up, which meant two places arguing with the
  // same athlete about the same week — one that ambushed them on whatever page
  // they opened, and one they had to come here to find. Same shape, same
  // buttons, one inbox. It goes first because it is the only one with an expiry
  // date: the others are about next week, this one is about this afternoon.
  const readiness = await readinessSuggestion(admin, user.id);
  const all = readiness ? [readiness, ...suggestions] : suggestions;

  return NextResponse.json({
    locked: false,
    storageReady: true,
    testStatus: {
      state: status.state, weeksSince: status.weeksSince,
      headline: status.headline, detail: status.detail,
    },
    suggestions: all,
    /** Nothing wrong is a result too — the UI says so instead of showing nothing. */
    clean: all.length === 0,
  });
}

/**
 * Today's pending readiness proposal, shaped like an advisor finding.
 *
 * Read-only: creating one is `/api/coach/suggestion`'s job, which the morning
 * notification already triggers. Reading it here must never write.
 */
async function readinessSuggestion(admin: ReturnType<typeof createAdminClient>, userId: string) {
  let s: Record<string, unknown> | undefined;
  try {
    const { data } = await admin.from("plan_suggestions").select("*")
      .eq("user_id", userId).eq("date", brtDateStr()).eq("status", "pending")
      .limit(1);
    s = (data ?? [])[0];
  } catch {
    // The advisor's own findings are worth showing even if this table is not
    // reachable — one missing proposal must not empty the whole inbox.
    return null;
  }
  if (!s) return null;

  const original  = s.original_day as WeeklyPlanDay | null;
  const suggested = s.suggested_day as WeeklyPlanDay | null;

  return {
    // The prefix is how POST knows which table this id belongs to.
    id: `readiness:${s.id as string}`,
    key: "prontidao_baixa",
    area: "recuperacao" as const,
    severity: "alta" as const,
    title: "Prontidão baixa para o treino de hoje",
    evidence: String(s.reason ?? ""),
    proposal: suggested
      ? `Trocar ${original?.label ?? "o treino de hoje"} por ${suggested.label}` +
        (suggested.distance_km != null ? ` de ${suggested.distance_km} km` : "") + "."
      : String(s.message ?? ""),
    rationale:
      "Sono, dor muscular e saldo de treino (TSB) apontam para um corpo ainda em reparo. " +
      "Um treino forte hoje custa mais recuperação do que entrega adaptação — o estímulo " +
      "rende quando o corpo está pronto para recebê-lo.",
    actionLabel: "Aliviar hoje",
    patch: null,
    status: "pending" as const,
    stale: false,
  };
}

function toApi(f: AdvisorFinding) {
  return {
    key: f.key, area: f.area, severity: f.severity, title: f.title,
    evidence: f.evidence, proposal: f.proposal, rationale: f.rationale,
    actionLabel: f.actionLabel ?? null, patch: f.patch, stale: false,
  };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { id?: string; action?: string } | null;
  const id = body?.id;
  const action = body?.action;
  if (!id || (action !== "accept" && action !== "dismiss")) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Readiness proposals live in their own table with their own accept — apply
  // the lighter day to the plan — so they are routed rather than reimplemented.
  if (id.startsWith("readiness:")) {
    return acceptReadiness(admin, user.id, id.slice("readiness:".length), action);
  }

  const { data: row } = await admin
    .from("advisor_suggestions").select("*")
    .eq("id", id).eq("user_id", user.id).maybeSingle();

  if (!row) return NextResponse.json({ error: "Sugestão não encontrada." }, { status: 404 });

  if (action === "dismiss") {
    await admin.from("advisor_suggestions").update({ status: "dismissed" }).eq("id", id);
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  // ── Accept: apply the patch, then rebuild the week from the new config ─────
  const { data: profile } = await admin
    .from("profiles").select("training_prefs, strength_prefs").eq("id", user.id).single();

  const prefs = normalizePrefs(profile?.training_prefs);
  const strengthPrefs = profile?.strength_prefs ? normalizeStrengthPrefs(profile.strength_prefs) : null;

  const result = applyAdvisorPatch(prefs, strengthPrefs, (row.patch ?? null) as AdvisorPatch);

  if (!result.changed) {
    // Advice-only findings are accepted as "read", with nothing to save.
    await admin.from("advisor_suggestions").update({ status: "accepted" }).eq("id", id);
    return NextResponse.json({ ok: true, status: "accepted", applied: false });
  }

  const update: Record<string, unknown> = { training_prefs: result.prefs };
  if (result.strengthPrefs) update.strength_prefs = result.strengthPrefs;

  const { error } = await admin.from("profiles").update(update).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar a mudança." }, { status: 500 });
  }

  await admin.from("advisor_suggestions").update({ status: "accepted" }).eq("id", id);

  // The plan on screen must reflect the change immediately, or "Aplicar" is a
  // promise the app doesn't keep.
  const weekStart = mondayOf(new Date());
  const rebuilt = await ensureWeeklyPlan(admin, user.id, weekStart, { force: true })
    .then(() => true, () => false);

  return NextResponse.json({ ok: true, status: "accepted", applied: true, planRebuilt: rebuilt });
}

/**
 * Accept or dismiss today's readiness proposal.
 *
 * Accepting swaps today's slot in the stored plan for the lighter session that
 * was proposed — the same thing the old pop-up did, reached from the one inbox.
 */
async function acceptReadiness(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  suggestionId: string,
  action: "accept" | "dismiss",
) {
  const { data: sug } = await admin
    .from("plan_suggestions").select("*")
    .eq("id", suggestionId).eq("user_id", userId).eq("status", "pending")
    .maybeSingle();

  if (!sug) return NextResponse.json({ error: "Sugestão não encontrada." }, { status: 404 });

  let applied = false;

  if (action === "accept") {
    // The same swap the dashboard makes — recorded, so it can be undone there.
    const inputs = await loadRecoveryInputs(admin, userId);
    if (inputs.plan && inputs.planReportId) {
      const result = applySwap(inputs.plan, dayKeyOf(inputs.today), "easy", String(sug.reason ?? "Recuperação baixa"));
      if (!("error" in result)) {
        await admin.from("coach_reports")
          .update({ full_report: JSON.stringify(result.plan) }).eq("id", inputs.planReportId);
        applied = true;
      }
    }
  }

  await admin.from("plan_suggestions")
    .update({ status: action === "accept" ? "accepted" : "dismissed" })
    .eq("id", suggestionId);

  return NextResponse.json({
    ok: true,
    status: action === "accept" ? "accepted" : "dismissed",
    applied,
  });
}
