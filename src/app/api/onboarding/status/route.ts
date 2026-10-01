/**
 * GET /api/onboarding/status
 *
 * What the athlete still needs to set up, computed from real data rather than a
 * "seen the tour" flag. The dashboard checklist stays until the setup is
 * actually complete — previously the welcome disappeared the moment a run
 * appeared, which hid it from exactly the people who had configured nothing.
 *
 * Existing users are unaffected in practice: anyone who already has a profile,
 * training days and runs comes back complete and sees nothing.
 */
import { NextResponse } from "next/server";
import { profileNeedsIdentity } from "@/lib/profile-identity";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalizePrefs, isDefaultRunWeek } from "@/lib/workout-builder";

export interface OnboardingStep {
  key:      string;
  label:    string;
  hint:     string;
  href:     string;
  done:     boolean;
  /** Core steps gate the checklist; the rest are recommendations. */
  core:     boolean;
  /** Estado já resolvido de outro jeito — "marcado para sex, 3 de out". */
  note?:    string | null;
}

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} de ${MONTH[d.getMonth()]}`;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const safe = async <T,>(q: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
    try { return (await q).data ?? []; } catch { return []; }
  };

  // `training_prefs` may not exist yet on older projects — degrade to null.
  const fetchProfile = async (): Promise<{
    name: string | null; username: string | null; training_prefs: unknown | null; strength_prefs?: unknown | null;
  } | null> => {
    try {
      const { data } = await admin
        .from("profiles").select("name, username, training_prefs, strength_prefs").eq("id", user.id).maybeSingle();
      return data ?? null;
    } catch {
      try {
        const { data } = await admin
          .from("profiles").select("name, username").eq("id", user.id).maybeSingle();
        return data ? { ...data, training_prefs: null } : null;
      } catch { return null; }
    }
  };

  const [profile, runs, tests, strava, push, planned] = await Promise.all([
    fetchProfile(),
    safe<{ id: string }>(admin.from("runs").select("id").eq("user_id", user.id).is("deleted_at", null).limit(1)),
    safe<{ id: string }>(admin.from("performance_tests").select("id").eq("user_id", user.id).limit(1)),
    safe<{ id: string }>(admin.from("strava_connections").select("id").eq("user_id", user.id).limit(1)),
    safe<{ id: string }>(admin.from("push_subscriptions").select("id").eq("user_id", user.id).limit(1)),
    // Um teste marcado não é um teste feito, mas também não é uma pendência:
    // cobrar quem já escolheu o dia é o app não prestando atenção.
    safe<{ date: string }>(admin.from("planned_tests").select("date").eq("user_id", user.id).eq("status", "scheduled").limit(1)),
  ]);

  // A name auto-derived from the e-mail prefix isn't a real name.
  const emailPrefix = (user.email ?? "").split("@")[0].toLowerCase();
  const name = (profile?.name ?? "").trim();
  const hasRealName = name.length > 0 && name.toLowerCase() !== emailPrefix;
  void hasRealName;
  const strengthDays =
    ((profile?.strength_prefs as { days?: unknown[] } | null)?.days ?? []).length;

  const plannedDate = planned[0]?.date ?? null;
  const plannedLabel = plannedDate ? formatDayLabel(plannedDate) : "";

  const steps: OnboardingStep[] = [
    {
      key:   "profile",
      label: "Complete seu perfil",
      hint:  "Nome, sobrenome e @username — é assim que seus amigos te encontram.",
      href:  "/settings",
      done:  !profileNeedsIdentity(profile, user.email),
      core:  true,
    },
    {
      key:   "week",
      label: "Escolha seus dias de corrida",
      hint:  "Sem isso o plano usa terça/quinta/sábado — que provavelmente não são os seus.",
      href:  "/coach",
      // Not `training_prefs != null`: saving strength days writes the whole
      // object, defaults included, and this step was being marked done for
      // athletes who had never picked a running day in their lives.
      done:  !isDefaultRunWeek(normalizePrefs(profile?.training_prefs)),
      core:  true,
    },
    {
      key:   "data",
      label: "Traga seus treinos",
      hint:  "Conecte o Strava ou registre uma corrida manualmente.",
      href:  "/settings",
      done:  strava.length > 0 || runs.length > 0,
      core:  true,
    },
    {
      key:   "strength",
      label: "Configure sua musculação",
      hint:  "Dias e grupos musculares. O treinador monta as séries a partir disso.",
      href:  "/coach",
      done:  strengthDays > 0,
      core:  false,
    },
    {
      key:   "test",
      label: "Faça um teste de 3 km",
      // Dizia "sem ele, o app estima pelas suas corridas" — o oposto do que o
      // motor faz. Estimar ritmo de treino que não é máximo produz número com
      // cara de medido, e weekly-plan.ts recusa isso explicitamente. Sem teste
      // o plano vem sem ritmo e sem FC, e é isso que a dica precisa dizer.
      hint:  plannedDate
        ? `Marcado para ${plannedLabel}. No dia, o check-in do treino pergunta se você fez.`
        : "Sem ele o plano vem sem ritmo e sem faixa de FC — o app não inventa esses números.",
      href:  "/coach",
      done:  tests.length > 0,
      note:  plannedDate ? `marcado para ${plannedLabel}` : null,
      core:  false,
    },
    {
      key:   "push",
      label: "Ative as notificações",
      hint:  "Treino do dia, alertas de overtraining e ajustes de plano.",
      href:  "/settings",
      done:  push.length > 0,
      core:  false,
    },
  ];

  const coreSteps = steps.filter(s => s.core);
  return NextResponse.json({
    steps,
    done:  steps.filter(s => s.done).length,
    total: steps.length,
    /** True once the essentials are in place — the checklist then disappears. */
    complete: coreSteps.every(s => s.done),
  });
}
