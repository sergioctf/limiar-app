/**
 * GET /api/cron/test-reminder
 * Mondays at 12:00 BRT (15:00 UTC).
 *
 * The 3 km test is the app's calibration point, and it decays silently: nothing
 * breaks when it goes stale, the paces just quietly stop describing the
 * athlete. So we ask — rarely, and only when it would actually change something.
 *
 * Cadence is derived from the calendar rather than stored state, so there is no
 * bookkeeping to drift:
 *   · never tested  → every other week, once they've run enough to have a baseline
 *   · 8+ weeks old  → every 4th week (weeks 8, 12, 16, …)
 * Anyone whose test is fresh hears nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { testStatus, TEST_AGING_WEEKS } from "@/lib/test-status";
import { brtDateStr, toBrt } from "@/lib/plan-notify";
import { authorizeCron } from "@/lib/cron-auth";
import type { PerformanceTest } from "@/types";

export const maxDuration = 60;

/** Runs needed before we bother asking a brand-new athlete to test. */
const MIN_RUNS_FOR_FIRST_TEST = 6;

/** ISO-ish week index, only used to space reminders out evenly. */
function weekIndex(d: Date): number {
  return Math.floor(toBrt(d).getTime() / (7 * 86400_000));
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";

  const admin = createAdminClient();
  const now   = new Date();
  const wk    = weekIndex(now);

  // Only athletes who have trained recently — a dormant account doesn't need
  // to be told its VDOT is old.
  const since = new Date(now.getTime() - 45 * 86400_000);
  const { data: activeRuns } = await admin
    .from("runs").select("user_id, date")
    .gte("date", since.toISOString().slice(0, 10))
    .is("deleted_at", null);

  const runCount = new Map<string, number>();
  for (const r of (activeRuns ?? []) as Array<{ user_id: string }>) {
    runCount.set(r.user_id, (runCount.get(r.user_id) ?? 0) + 1);
  }

  const results: Record<string, string> = {};
  let sentCount = 0;

  for (const [userId, runs] of Array.from(runCount.entries())) {
    let tests: PerformanceTest[] = [];
    try {
      const { data } = await admin
        .from("performance_tests").select("*")
        .eq("user_id", userId).order("test_date", { ascending: false }).limit(1);
      tests = (data ?? []) as PerformanceTest[];
    } catch {
      results[userId] = "skip:no_table";
      continue;
    }

    const status = testStatus(tests);
    let title = "", body = "";

    if (status.state === "missing") {
      if (runs < MIN_RUNS_FOR_FIRST_TEST) { results[userId] = "skip:few_runs"; continue; }
      if (wk % 2 !== 0)                   { results[userId] = "skip:cadence";  continue; }
      title = "Seu plano ainda está sem ritmos";
      body  = "15 minutos de teste de 3 km liberam ritmos, faixas de FC e previsão de prova. Sem ele, o app monta o treino mas não sabe em que velocidade você deve correr.";
    } else if (status.weeksSince != null && status.weeksSince >= TEST_AGING_WEEKS) {
      if (status.weeksSince % 4 !== 0) { results[userId] = "skip:cadence"; continue; }
      title = `Teste de 3 km: ${status.weeksSince} semanas`;
      body  = "Seus ritmos saem do último teste. Depois de dois meses de treino eles costumam ficar lentos demais — refaça e recalibre o plano.";
    } else if (status.state === "no_hr" && wk % 4 === 0) {
      title = "Faltam suas faixas de FC";
      body  = "Seu teste não tem FC média registrada, então as zonas ficaram de fora. No próximo, anote a FC média — é ela que libera as faixas.";
    } else {
      results[userId] = `skip:${status.state}`;
      continue;
    }

    if (dryRun) { results[userId] = `dry:${title}`; sentCount++; continue; }

    try {
      const { sent } = await sendPushToUser(admin, userId, {
        title, body,
        url:  "/coach",
        tag:  `limiar-test-reminder-${brtDateStr(now)}`,
        icon: "/api/icons/192",
      });
      results[userId] = sent > 0 ? `sent:${sent}` : "no_subscription";
      if (sent > 0) sentCount++;
    } catch (err) {
      results[userId] = `error:${err instanceof Error ? err.message : "unknown"}`;
    }
  }

  return NextResponse.json({
    ok: true, ran_at: now.toISOString(), week: wk,
    candidates: runCount.size, sent: sentCount, results,
  });
}
