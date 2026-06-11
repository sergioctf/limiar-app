/**
 * GET /api/cron/weekly-report
 *
 * Cron automático — executa toda segunda-feira às 10:00 UTC (07:00 BRT).
 * Para cada usuário:
 *   1. Gera resumo da SEMANA PASSADA com IA e salva em coach_reports
 *   2. Gera PLANO DA SEMANA ATUAL com IA (se ainda não existe) e salva em coach_reports
 *
 * Protegido por CRON_SECRET (Vercel injeta automaticamente) ou ?secret=limiar_admin_2026
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateWeeklySummary,
  generateStructuredWeeklyPlan,
} from "@/lib/ai";
import { detectPatterns } from "@/lib/patterns";
import { sendPushToUser } from "@/lib/push";
import type { Run, Activity } from "@/types";

// 5 minutes — enough for multiple users + AI calls
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
  const thisSundayStr = toDateStr(new Date(thisMonday.getTime() + 6 * 86400000));

  // ── 1. Generate last week's summary ────────────────────────────────────────
  let summaryStatus = "skipped";

  // Fetch last week's runs
  const { data: lastWeekRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", lastMondayStr)
    .lte("date", lastSundayStr)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  if (lastWeekRuns && lastWeekRuns.length > 0) {
    // Check if summary already exists for last week
    const { data: existingSummary } = await admin
      .from("coach_reports")
      .select("id")
      .eq("user_id", userId)
      .eq("period_type", "week")
      .eq("period_start", lastMondayStr)
      .not("summary", "is", null)
      .limit(1)
      .single();

    if (!existingSummary) {
      // Fetch all runs for historical context
      const { data: allRuns } = await admin
        .from("runs")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("date", { ascending: false });

      // Fetch last week's activities (gym etc.)
      const { data: weekActivities } = await admin
        .from("activities")
        .select("id, date, name, sport_type, duration_seconds, calories, avg_hr, source")
        .eq("user_id", userId)
        .gte("date", lastMondayStr)
        .lte("date", lastSundayStr)
        .is("deleted_at", null);

      // Active goal
      const { data: goals } = await admin
        .from("goals")
        .select("race_name, race_date")
        .eq("user_id", userId)
        .in("status", ["active", "upcoming"])
        .order("race_date", { ascending: true })
        .limit(1);

      const goal = goals?.[0];
      const goalName = goal?.race_name as string | undefined;
      const weeksToGoal = goal?.race_date
        ? Math.ceil((new Date(goal.race_date as string).getTime() - now.getTime()) / (7 * 86400000))
        : undefined;

      const summary = await generateWeeklySummary(
        lastWeekRuns as Run[],
        allRuns as Run[] ?? [],
        goalName,
        weeksToGoal,
        weekActivities as Activity[] | undefined,
      );

      if (summary) {
        const totalKm = (lastWeekRuns as Run[]).reduce((s, r) => s + r.distance_km, 0);

        // Upsert: update existing or insert new
        const { data: existing } = await admin
          .from("coach_reports")
          .select("id")
          .eq("user_id", userId)
          .eq("period_type", "week")
          .eq("period_start", lastMondayStr)
          .limit(1)
          .single();

        const payload = {
          user_id:      userId,
          title:        `Resumo da semana — ${lastMondayStr}`,
          report_date:  thisMondayStr,
          period_type:  "week",
          period_start: lastMondayStr,
          period_end:   lastSundayStr,
          summary,
          full_report:  summary,
          updated_at:   now.toISOString(),
        };

        if (existing?.id) {
          await admin.from("coach_reports").update(payload).eq("id", existing.id);
        } else {
          await admin.from("coach_reports").insert(payload);
        }
        summaryStatus = `generated (${(lastWeekRuns as Run[]).length} runs, ${totalKm.toFixed(1)} km)`;

        // Push: avisa que o resumo da semana está pronto
        sendPushToUser(admin, userId, {
          title: "Resumo da semana pronto 📊",
          body:  `${(lastWeekRuns as Run[]).length} corridas, ${totalKm.toFixed(1)} km. Veja seu desempenho e o plano da nova semana.`,
          url:   "/coach",
          tag:   "limiar-weekly-summary",
          icon:  "/limiar_icone_app.png",
        }).catch(() => {});
      } else {
        summaryStatus = "ai-failed";
      }
    } else {
      summaryStatus = "already-exists";
    }
  } else {
    summaryStatus = "no-runs-last-week";
  }

  // ── 2. Generate this week's plan ───────────────────────────────────────────
  let planStatus = "skipped";

  // Check if plan already exists for this week
  const { data: existingPlan } = await admin
    .from("coach_reports")
    .select("id, full_report")
    .eq("user_id", userId)
    .eq("period_type", "week")
    .eq("period_start", thisMondayStr)
    .limit(1)
    .single();

  // Only generate if no valid structured plan exists
  const hasValidPlan = (() => {
    if (!existingPlan?.full_report) return false;
    try {
      const parsed = JSON.parse(existingPlan.full_report);
      return Array.isArray(parsed?.days) && parsed.days.length > 0;
    } catch { return false; }
  })();

  if (!hasValidPlan) {
    const { data: recentRuns } = await admin
      .from("runs")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(30);

    // VDOT
    let vdot: number | null = null;
    try {
      const { data: tests } = await admin
        .from("performance_tests")
        .select("vdot")
        .eq("user_id", userId)
        .order("test_date", { ascending: false })
        .limit(1);
      vdot = (tests?.[0]?.vdot as number | null) ?? null;
    } catch { /* table may not exist */ }

    // Next race
    let nextRace = null;
    try {
      const { data: races } = await admin
        .from("races")
        .select("name, race_date, distance_km")
        .eq("user_id", userId)
        .gt("race_date", thisMondayStr)
        .is("time_seconds", null)
        .order("race_date", { ascending: true })
        .limit(1);
      if (races?.[0]) {
        nextRace = {
          name:        races[0].name as string,
          date:        races[0].race_date as string,
          distance_km: races[0].distance_km as number,
        };
      }
    } catch { /* table may not exist */ }

    // Athlete profile
    let athleteProfile: string | null = null;
    try {
      const { data: notes } = await admin
        .from("athlete_notes")
        .select("category, content")
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(30);
      if (notes && notes.length > 0) {
        athleteProfile = notes.map((n: { category: string; content: string }) =>
          `[${n.category}] ${n.content}`
        ).join("\n");
      }
    } catch { /* table may not exist */ }

    const plan = await generateStructuredWeeklyPlan(
      thisMondayStr,
      recentRuns as Run[] ?? [],
      null, // paces from UI not available here
      nextRace,
      vdot,
      athleteProfile,
    );

    if (plan) {
      const trainingDays = plan.days.filter(d => d.type !== "rest").length;
      const planPayload = {
        user_id:      userId,
        title:        `Plano da semana — ${thisMondayStr}`,
        report_date:  thisMondayStr,
        period_type:  "week",
        period_start: thisMondayStr,
        period_end:   thisSundayStr,
        summary:      plan.ai_message ?? `${trainingDays} treinos planejados`,
        full_report:  JSON.stringify(plan),
        updated_at:   now.toISOString(),
      };

      if (existingPlan?.id) {
        await admin.from("coach_reports").update(planPayload).eq("id", existingPlan.id);
      } else {
        await admin.from("coach_reports").insert(planPayload);
      }
      planStatus = `generated (${trainingDays} training days)`;
    } else {
      planStatus = "ai-failed";
    }
  } else {
    planStatus = "already-exists";
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

export async function GET(request: NextRequest) {
  // Auth: accept Vercel CRON_SECRET or manual admin secret
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isManual     = querySecret === "limiar_admin_2026";

  if (!isVercelCron && !isManual) {
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
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), results });
}
