/**
 * GET  /api/coach/weekly-plan/freshness
 *   → whether this week's and next week's plans still match the athlete's
 *     configuration, and why not.
 *
 * POST /api/coach/weekly-plan/freshness
 *   → rebuild whichever of the two weeks is out of date.
 *
 * Next week is rebuilt without being asked. Nothing in it has happened yet, so
 * there is no version of it worth preserving — and a plan for a week that has
 * not started should simply be the current best plan.
 *
 * This week is only rebuilt on request. Sessions already run are part of the
 * athlete's week, and silently rewriting Wednesday's tiro on Wednesday evening
 * would be the app editing history it does not own.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { weekIsUnderway } from "@/lib/mesocycle";
import { localDateStr } from "@/lib/week";
import {
  checkPlanFreshness, ensureWeeklyPlan, mondayOf, nextMondayOf,
} from "@/lib/weekly-plan";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const thisWeek = mondayOf(now);
  const next = nextMondayOf(now);

  try {
    const [current, upcoming] = await Promise.all([
      checkPlanFreshness(admin, user.id, thisWeek),
      checkPlanFreshness(admin, user.id, next),
    ]);

    /*
     * A week already underway is deliberately frozen — regeneration refuses to
     * rewrite a plan the athlete has been living in — so calling it stale is
     * asking for something the app will not do. Sérgio pressed the button ten
     * times and it never went away: the rebuild was politely declined, the
     * fingerprint never moved, and the banner asked again forever.
     *
     * So the current week only counts as stale while it can still be changed.
     * Once it has begun, the honest report is about next week.
     */
    const underway = weekIsUnderway(thisWeek, localDateStr(now));
    const currentActionable = current.stale && !underway;

    // Reporting only. Rebuilding next week here made this endpoint wait on a
    // plan generation — including its AI note — so the banner's own fetch hung
    // for the best part of a minute on the one page it was supposed to make
    // faster. The client fires the rebuild separately and does not wait for it.
    return NextResponse.json({
      week: thisWeek,
      stale: currentActionable,
      reasons: currentActionable ? current.reasons : [],
      message: currentActionable ? current.message : "",
      nextWeekStale: upcoming.hasPlan && upcoming.stale,
      /* So the banner can say which week it is offering to fix. */
      currentWeekFrozen: underway && current.stale,
    });
  } catch {
    // Freshness is an improvement on the page, never a reason to break it.
    return NextResponse.json({ stale: false, reasons: [], message: "", nextWeekStale: false });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const admin = createAdminClient();
  const now = new Date();

  // Both weeks by default — the athlete asked for their plan to be up to date,
  // not for one week of it to be.
  const weeks = body?.week === "next" ? [nextMondayOf(now)] : [mondayOf(now), nextMondayOf(now)];

  const rebuilt: string[] = [];
  const frozen: string[] = [];
  for (const week of weeks) {
    /*
     * `frozen` is not failure. A week in progress is protected on purpose, and
     * counting the untouched plan it returns as "rebuilt" is what made this
     * endpoint report success while changing nothing.
     */
    const r = await ensureWeeklyPlan(admin, user.id, week, { force: true })
      .catch(() => null);
    if (r?.frozen) frozen.push(week);
    else if (r?.plan != null) rebuilt.push(week);
  }

  if (rebuilt.length === 0 && frozen.length === 0) {
    return NextResponse.json({ error: "Não foi possível atualizar o plano." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rebuilt, frozen });
}
