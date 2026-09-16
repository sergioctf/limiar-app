/**
 * GET  /api/coach/split-proposal → what a rebalanced split would look like
 * POST /api/coach/split-proposal → apply it
 *
 * The POST recomputes the proposal from scratch rather than accepting one from
 * the client. Otherwise the preview and the change are two different things,
 * and a stale tab could save a split the athlete never saw — which is exactly
 * the failure this feature exists to avoid.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { proposeSplit } from "@/lib/split-rebalance";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";
import { normalizePrefs } from "@/lib/workout-builder";
import { ensureWeeklyPlan, mondayOf } from "@/lib/weekly-plan";

/** Read the athlete's config and compute the proposal. One place, two callers. */
async function build(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles").select("training_prefs, strength_prefs").eq("id", userId).single();

  if (!data?.strength_prefs) return null;

  const strength = normalizeStrengthPrefs(data.strength_prefs);
  const prefs = normalizePrefs(data.training_prefs);

  return {
    admin,
    strength,
    proposal: proposeSplit(
      strength.days.map(d => ({ day: d.day, muscles: d.muscles })),
      { longRunDay: prefs.longRunDay },
    ),
  };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const built = await build(user.id);
    if (!built) return NextResponse.json({ worthIt: false });
    return NextResponse.json(built.proposal);
  } catch {
    // A proposal is an improvement on the page, never a reason to break it.
    return NextResponse.json({ worthIt: false });
  }
}

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const built = await build(user.id);
  if (!built?.proposal.worthIt) {
    return NextResponse.json({ error: "Nada a reorganizar." }, { status: 400 });
  }

  const { admin, strength, proposal } = built;

  // Muscles change; everything else about the day — the cardio add-on, the
  // exercise roster the athlete built by swapping at the rack — stays. A
  // reorganisation that wiped those would cost more than it gained.
  const byDay = new Map(proposal.after.map(d => [d.day, d.muscles]));
  const next = {
    ...strength,
    days: strength.days.map(d => ({
      ...d,
      muscles: byDay.get(d.day) ?? d.muscles,
      // The roster was chosen for the old muscles; keeping it would prescribe
      // chest work on what is now a leg day.
      exercises: byDay.has(d.day) ? undefined : d.exercises,
    })),
  };

  const { error } = await admin
    .from("profiles")
    .update({ strength_prefs: normalizeStrengthPrefs(next) })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar o novo split." }, { status: 500 });
  }

  // Rebuild this week so the change is visible immediately. Next week is
  // handled by the freshness check, which will see the configuration moved.
  const rebuilt = await ensureWeeklyPlan(admin, user.id, mondayOf(new Date()), { force: true })
    .then(r => r.plan != null, () => false);

  return NextResponse.json({ ok: true, planRebuilt: rebuilt });
}
