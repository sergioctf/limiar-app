/**
 * GET  /api/coach/weekly-plan?week=YYYY-MM-DD  → stored plan for that week (no AI cost)
 * POST /api/coach/weekly-plan { paces?, force?, week? }
 *
 * - Plan already exists for the week and force !== true → returns it (no tokens spent)
 * - force === true OR no plan → generates with AI and upserts the week's report
 *
 * `week` must be a Monday; it defaults to the current week and may not be more
 * than one week ahead (the coach shows this week + next).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  ensureWeeklyPlan, loadWeeklyPlan, mondayOf, nextMondayOf, previousMondayOf,
} from "@/lib/weekly-plan";

/**
 * Weeks the coach is allowed to touch: the previous, current and next one.
 *
 * The previous week is accepted on purpose — the client computes its week in
 * the browser's timezone, and around midnight the two can legitimately differ
 * by a week. Rejecting that made the app fail with "Semana inválida" late at
 * night, when nothing was actually wrong.
 */
function resolveWeek(requested: unknown): string | null {
  const now = new Date();
  const current = mondayOf(now);
  if (requested == null) return current;
  if (typeof requested !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return null;

  const allowed = [previousMondayOf(now), current, nextMondayOf(now)];
  return allowed.includes(requested) ? requested : null;
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const week = resolveWeek(request.nextUrl.searchParams.get("week") ?? undefined);
  if (!week) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });

  const { plan, reportId } = await loadWeeklyPlan(createAdminClient(), user.id, week);
  return NextResponse.json({ plan, reportId, week, cached: true });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const week = resolveWeek(body?.week);
  if (!week) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });

  const result = await ensureWeeklyPlan(createAdminClient(), user.id, week, {
    force: body?.force === true,
    paces: body?.paces ?? null,
  });

  if (!result.plan) {
    return NextResponse.json({ error: result.error ?? "AI generation failed" }, { status: 422 });
  }

  return NextResponse.json({
    plan: result.plan, saved: !result.frozen, cached: result.cached,
    reportId: result.reportId, week,
    // A refusal to rewrite a week in progress is not an error — the athlete gets
    // the plan they already had, plus the reason and where the fix will land.
    frozen: result.frozen ?? false,
    notice: result.frozen ? result.error : undefined,
    suggestWeek: result.suggestWeek,
  });
}
