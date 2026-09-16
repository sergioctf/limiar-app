/**
 * The advisor — the last piece of the coaching loop.
 *
 * The athlete configures, the deterministic engines build, and this module
 * *observes the result* and proposes changes the athlete may accept or ignore.
 * It never edits anything on its own: every finding carries an explicit patch
 * that only runs when the athlete presses "Aplicar".
 *
 * Same contract as the rest of the app: the findings below are computed from
 * data with rules from TRAINING_SCIENCE.md. A language model only turns a
 * finding into readable prose — it never decides what is wrong.
 *
 * Everything here needs calibrated intensities, which is why the advisor is
 * gated behind the 3 km test (see test-status.ts). Without a measured VDOT it
 * cannot tell a hard session from an easy one, and its advice would be shaped
 * guessing.
 */
import { GOAL_PARAMS, type StrengthPrefs, type CardioAddon } from "@/lib/strength-prefs";
import { MUSCLE_LABEL, exerciseById, type MuscleGroup } from "@/lib/exercises";
import type { DayKey, TrainingPrefs, WeeklyPlanDay, Race } from "@/types";
import { isRunSession } from "@/lib/sports";

const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_PT: Record<DayKey, string> = {
  Mon: "segunda", Tue: "terça", Wed: "quarta", Thu: "quinta",
  Fri: "sexta",   Sat: "sábado", Sun: "domingo",
};

export type AdvisorArea = "integracao" | "forca" | "corrida" | "recuperacao" | "teste";
export type AdvisorSeverity = "alta" | "media" | "baixa";

/**
 * A concrete change the athlete can apply with one tap. `null` means the
 * finding is advice only — something to know, not something to toggle.
 */
export type AdvisorPatch =
  | { kind: "strength_move_day"; from: DayKey; to: DayKey }
  | { kind: "strength_swap_days"; a: DayKey; b: DayKey }
  | { kind: "strength_add_muscle"; day: DayKey; muscle: MuscleGroup }
  | { kind: "strength_remove_muscle"; day: DayKey; muscle: MuscleGroup }
  | { kind: "strength_cardio_intensity"; day: DayKey; intensity: NonNullable<CardioAddon["intensity"]> }
  | { kind: "prefs_quality"; qualityPerWeek: number }
  | { kind: "prefs_long_run_day"; day: DayKey }
  | { kind: "prefs_run_days"; runDays: DayKey[] }
  | null;

export interface AdvisorFinding {
  /** Stable across weeks, so a dismissal is remembered. */
  key:      string;
  area:     AdvisorArea;
  severity: AdvisorSeverity;
  title:    string;
  /** What we measured — numbers, never opinion. */
  evidence: string;
  /** What we propose, in one sentence. */
  proposal: string;
  /** The rule behind it, cited so the athlete can push back. */
  rationale: string;
  patch:    AdvisorPatch;
  /** Label for the apply button when there is a patch. */
  actionLabel?: string;
}

export interface AdvisorInput {
  prefs:         TrainingPrefs;
  strengthPrefs: StrengthPrefs | null;
  planDays:      WeeklyPlanDay[];
  /** Weekly running km, most recent first, up to 8 weeks. */
  weeklyKm:      number[];
  /** Sets per muscle per week, averaged over the last 4 weeks of logs. */
  loggedSetsPerMuscle: Map<MuscleGroup, number>;
  /** Per exercise: sessions logged, load change, and what to try next. */
  liftProgress:  Array<{
    exerciseId: string;
    name:       string;
    sessions:   number;
    deltaKg:    number;
    /** Heaviest set of the most recent session, when there is a load. */
    lastKg?:    number | null;
    /** What the progression engine says to lift next. */
    suggestedKg?: number | null;
    /** How long this movement has been in the plan, in weeks. */
    weeksInPlan: number;
  }>;
  /** Strength sessions prescribed vs. logged over the last 3 weeks. */
  strengthLogged: { prescribed: number; logged: number };
  nextRace:      Race | null;
  /** Fraction of planned sessions completed over recent weeks (0–1), or null. */
  adherence:     number | null;
  /**
   * A recurring execution habit across recent runs, from workout-execution.
   * One fast start is a bad day; four in a row is something to talk about.
   */
  executionHabit?: { key: string; count: number; total: number } | null;
}

// ── helpers ────────────────────────────────────────────────────────────────

function dayPt(d: DayKey): string { return DAY_PT[d] ?? d; }

/** "na sexta" / "no sábado" — weekend days are masculine in Portuguese. */
function onDay(d: DayKey): string {
  return `${d === "Sat" || d === "Sun" ? "no" : "na"} ${dayPt(d)}`;
}

function idx(d: DayKey): number { return DAY_ORDER.indexOf(d); }

/** Days between two weekdays, going forward (Sat → Sun = 1, Sun → Mon = 1). */
function gapForward(from: DayKey, to: DayKey): number {
  return (idx(to) - idx(from) + 7) % 7;
}

const HARD_RUN = new Set(["tempo", "intervals", "long_run", "race", "test"]);

/** Muscles whose training genuinely compromises running the next day. */
const LOWER_BODY: MuscleGroup[] = ["quadriceps", "posterior", "gluteo", "panturrilha"];

function isLowerBodyDay(muscles: MuscleGroup[]): boolean {
  return muscles.filter(m => LOWER_BODY.includes(m)).length >= 2;
}

function daysUntil(dateStr: string): number {
  return Math.round(
    (new Date(`${dateStr}T12:00:00`).getTime() - Date.now()) / 86400_000,
  );
}

/** A free day the athlete isn't already using, closest to `preferred`. */
function freeDay(used: Set<DayKey>, preferred: DayKey[]): DayKey | null {
  for (const d of preferred) if (!used.has(d)) return d;
  for (const d of DAY_ORDER) if (!used.has(d)) return d;
  return null;
}

// ── the findings engine ────────────────────────────────────────────────────

/**
 * Everything worth telling the athlete this week, most severe first.
 *
 * Ordering matters: findings that risk injury or wreck a key session come
 * before ones that merely cost a little progress.
 */
export function analyzeTraining(input: AdvisorInput): AdvisorFinding[] {
  const out: AdvisorFinding[] = [];
  const { prefs, strengthPrefs, planDays, weeklyKm, nextRace } = input;

  const runByDay   = new Map<DayKey, WeeklyPlanDay>();
  for (const d of planDays) {
    // Runs only. Cross-training days are typed `easy` too, and counting a
    // pilates session as a run made the findings below argue about the legs it
    // would leave for tomorrow's tiro.
    if (isRunSession(d)) runByDay.set(d.day as DayKey, d);
  }
  const strengthDays = strengthPrefs?.days ?? [];
  const usedDays = new Set<DayKey>([
    ...prefs.runDays,
    ...strengthDays.map(d => d.day),
  ]);

  // ── INTEGRAÇÃO: where running and lifting collide ────────────────────────

  // 1. Heavy legs the day before the long run. The single most expensive
  //    scheduling mistake: the long run is the week's highest-value session and
  //    it lands on legs that are still 24–48 h into repair.
  const longRun = planDays.find(d => d.type === "long_run");
  if (longRun) {
    const longDay = longRun.day as DayKey;

    for (const sd of strengthDays) {
      if (!isLowerBodyDay(sd.muscles)) continue;
      if (gapForward(sd.day, longDay) !== 1) continue;

      // Swapping with an existing upper-body day is almost always better than
      // moving to an empty slot: the week keeps the same shape, and the free
      // day is often the one right *after* the long run — legs on trashed legs.
      const swap = strengthDays
        .filter(d => d.day !== sd.day && !isLowerBodyDay(d.muscles))
        .filter(d => gapForward(d.day, longDay) >= 2)
        .sort((a, b) => gapForward(b.day, longDay) - gapForward(a.day, longDay))[0];

      // Only fall back to an empty day that leaves room on both sides: at least
      // 2 days before the long run and not the day straight after it.
      const alt = swap ? null : freeDay(usedDays, DAY_ORDER.filter(d =>
        d !== longDay
        && gapForward(d, longDay) >= 2
        && gapForward(longDay, d) !== 1));

      const patch: AdvisorPatch = swap
        ? { kind: "strength_swap_days", a: sd.day, b: swap.day }
        : alt ? { kind: "strength_move_day", from: sd.day, to: alt } : null;

      out.push({
        key: `perna_antes_longao_${sd.day}`,
        area: "integracao",
        severity: "alta",
        title: `Perna ${onDay(sd.day)}, longão ${onDay(longDay)}`,
        evidence: `Menos de 24 h entre o treino de perna e o longão de ${longRun.distance_km ?? "?"} km.`,
        proposal: swap
          ? `Trocar o dia de perna com o de ${swap.muscles.map(m => MUSCLE_LABEL[m]).join("/")} ${onDay(swap.day)} — a perna ganha ${gapForward(swap.day, longDay)} dias de folga antes do longão.`
          : alt
            ? `Mover a musculação de perna para ${dayPt(alt)}, deixando pelo menos 48 h antes do longão.`
            : "Trocar esse dia de perna por membros superiores, ou aceitar um longão mais leve.",
        rationale:
          "Dano muscular de treino de força pesado leva 24–48 h para se resolver. Correr longo em cima disso " +
          "piora a economia de corrida e aumenta o risco de lesão — e o longão é justamente a sessão que você " +
          "menos pode desperdiçar.",
        patch,
        actionLabel: swap
          ? `Trocar com ${dayPt(swap.day)}`
          : alt ? `Mover para ${dayPt(alt)}` : undefined,
      });
      break;
    }
  }

  // 2. Legs and a quality run on the same day. Not always wrong — but it needs
  //    spacing, and the app should say so out loud.
  for (const sd of strengthDays) {
    if (!isLowerBodyDay(sd.muscles)) continue;
    const run = runByDay.get(sd.day);
    if (!run || !HARD_RUN.has(run.type)) continue;

    out.push({
      key: `perna_mesmo_dia_qualidade_${sd.day}`,
      area: "integracao",
      severity: "media",
      title: `${dayPt(sd.day).replace(/^./, c => c.toUpperCase())}: perna e ${run.label.toLowerCase()} no mesmo dia`,
      evidence: "Sessão de qualidade e treino de perna caem no mesmo dia.",
      proposal: "Corra primeiro e levante depois, com pelo menos 6 h entre as duas — ou aceite perder carga na musculação.",
      rationale:
        "O efeito de interferência é pequeno quando as sessões estão separadas por ~6 h; colado, o segundo " +
        "treino sempre sai pior. Correr primeiro protege a sessão que decide seu desempenho.",
      patch: null,
    });
    break;
  }

  // 3. Seven days of training. Recovery is when adaptation happens — a week
  //    without a single day off eventually stops producing progress.
  if (usedDays.size >= 7) {
    out.push({
      key: "sem_dia_livre",
      area: "recuperacao",
      severity: "media",
      title: "Nenhum dia livre na semana",
      evidence: `Você tem ${prefs.runDays.length} dia(s) de corrida e ${strengthDays.length} de musculação, cobrindo os 7 dias.`,
      proposal: "Deixe um dia inteiramente livre — o ganho vem na recuperação, não no acúmulo.",
      rationale:
        "Adaptação acontece no descanso. Sem nenhum dia de folga a fadiga se acumula silenciosamente e " +
        "aparece como platô, sono ruim ou lesão, não como cansaço óbvio.",
      patch: null,
    });
  }

  // ── FORÇA ────────────────────────────────────────────────────────────────

  if (strengthPrefs && strengthDays.length > 0) {
    const goal = GOAL_PARAMS[strengthPrefs.goal];

    // 4. Muscles hit only once a week, when the goal wants frequency.
    const freq = new Map<MuscleGroup, DayKey[]>();
    for (const d of strengthDays) {
      for (const m of d.muscles) freq.set(m, [...(freq.get(m) ?? []), d.day]);
    }

    let frequencyFlagged = false;
    if (strengthPrefs.goal === "hipertrofia" && strengthDays.length >= 2) {
      const once: MuscleGroup[] = [];
      freq.forEach((days, m) => { if (days.length === 1) once.push(m); });

      if (once.length >= 4) {
        // Nothing to patch one muscle at a time — the split itself is the issue,
        // and reshaping someone's whole week is their call, not a button.
        frequencyFlagged = true;
        out.push({
          key: "split_frequencia_1x",
          area: "forca",
          severity: "media",
          title: "Seu split treina cada grupo 1×/semana",
          evidence: `${once.length} grupos musculares aparecem em um único dia (${strengthDays.length} dias de musculação).`,
          proposal: strengthDays.length >= 3
            ? "Trocar para superior/inferior alternado: com 3 dias cada grupo é treinado ~1,5×/semana, sem aumentar o tempo de academia."
            : "Usar full body nos dois dias — com 2 dias na semana, é o formato que mais entrega.",
          rationale:
            "Com o mesmo volume total, dividir em duas sessões rende mais hipertrofia que concentrar em uma. " +
            "A síntese proteica volta ao normal em ~48 h; um único estímulo semanal deixa essa janela vazia " +
            "por vários dias.",
          patch: null,
        });
      } else if (once.length > 0) {
        const target = once[0];
        const currentDay = freq.get(target)![0];
        const isLower = LOWER_BODY.includes(target);

        // Add it to a day that trains the same region — chest on leg day is a
        // technically valid patch and terrible advice.
        const candidate = strengthDays
          .filter(d => d.day !== currentDay
            && !d.muscles.includes(target)
            && isLowerBodyDay(d.muscles) === isLower)
          .sort((a, b) =>
            Math.abs(gapForward(currentDay, b.day) - 3) - Math.abs(gapForward(currentDay, a.day) - 3))
          .pop();

        frequencyFlagged = true;
        out.push({
          key: `frequencia_1x_${once.slice(0, 3).join("_")}`,
          area: "forca",
          severity: "media",
          title: `${once.map(m => MUSCLE_LABEL[m]).join(", ")} só 1×/semana`,
          evidence: `Seu objetivo é hipertrofia e ${once.length === 1 ? "esse grupo aparece" : "esses grupos aparecem"} em um único dia.`,
          proposal: candidate
            ? `Incluir ${MUSCLE_LABEL[target]} também ${onDay(candidate.day)}, dividindo o volume em duas sessões.`
            : "Dividir o volume desses grupos em dois dias da semana.",
          rationale:
            "Com o mesmo volume total, duas sessões por semana rendem mais hipertrofia que uma — a síntese " +
            "proteica volta ao normal em ~48 h, então um segundo estímulo na semana aproveita uma janela que " +
            "hoje fica vazia.",
          patch: candidate ? { kind: "strength_add_muscle", day: candidate.day, muscle: target } : null,
          actionLabel: candidate ? `Adicionar ${onDay(candidate.day)}` : undefined,
        });
      }
    }

    // 5. Posterior chain neglected relative to quads — the classic runner's
    //    imbalance, and the one that shows up as a hamstring strain.
    const quadSets = input.loggedSetsPerMuscle.get("quadriceps") ?? 0;
    const postSets = input.loggedSetsPerMuscle.get("posterior") ?? 0;
    const hasLowerDay = strengthDays.some(d => isLowerBodyDay(d.muscles));
    if (hasLowerDay && quadSets >= 4 && postSets < quadSets * 0.6) {
      const candidate = strengthDays.find(d => isLowerBodyDay(d.muscles) && !d.muscles.includes("posterior"));
      out.push({
        key: "posterior_negligenciado",
        area: "forca",
        severity: "alta",
        title: "Posterior de coxa muito atrás do quadríceps",
        evidence: `Média de ${quadSets.toFixed(1)} séries/semana de quadríceps contra ${postSets.toFixed(1)} de posterior.`,
        proposal: candidate
          ? `Incluir posterior ${onDay(candidate.day)} — stiff, mesa flexora ou nórdico.`
          : "Adicionar 2 séries semanais de nórdico ou stiff.",
        rationale:
          "Corrida já é dominante de quadríceps; treinar quase só quadríceps aprofunda o desequilíbrio. " +
          "O exercício nórdico, com 2 séries por semana, é uma das poucas intervenções com redução de lesão " +
          "de posterior bem documentada.",
        patch: candidate ? { kind: "strength_add_muscle", day: candidate.day, muscle: "posterior" } : null,
        actionLabel: candidate ? `Incluir ${onDay(candidate.day)}` : undefined,
      });
    }

    // 6. Weekly volume outside the range the chosen goal needs.
    const trained = Array.from(freq.keys());
    const below = trained.filter(m => {
      const s = input.loggedSetsPerMuscle.get(m) ?? 0;
      return s > 0 && s < goal.setsPerMuscleWeek[0] * 0.7;
    });
    // Skipped when the frequency finding already fired: same root cause, and
    // two cards saying "train more" is nagging, not coaching.
    if (below.length >= 2 && strengthPrefs.goal === "hipertrofia" && !frequencyFlagged) {
      out.push({
        key: `volume_baixo_${below.slice(0, 3).join("_")}`,
        area: "forca",
        severity: "baixa",
        title: "Volume abaixo do que seu objetivo pede",
        evidence: `${below.map(m => MUSCLE_LABEL[m]).join(", ")} abaixo de ${goal.setsPerMuscleWeek[0]} séries/semana nos registros.`,
        proposal: "Aumentar 2–4 séries semanais nesses grupos, ou alongar a sessão em ~10 minutos.",
        rationale:
          `Para hipertrofia, ${goal.setsPerMuscleWeek[0]}–${goal.setsPerMuscleWeek[1]} séries semanais por grupo é a faixa ` +
          "com melhor relação dose-resposta. Abaixo disso o estímulo mantém, mas constrói pouco.",
        patch: null,
      });
    }

    // 7. Cardio add-on fighting the lifting on the same day.
    for (const d of strengthDays) {
      const c = d.cardio;
      if (!c || c.machine === "nenhum") continue;
      const conflictBefore = c.position === "antes" && (c.intensity === "tempo" || c.intensity === "intervalado");
      const conflictLegs   = c.position === "depois" && c.intensity === "intervalado" && isLowerBodyDay(d.muscles);
      if (!conflictBefore && !conflictLegs) continue;

      out.push({
        key: `cardio_conflito_${d.day}`,
        area: "integracao",
        severity: "baixa",
        title: `Cardio ${c.intensity} ${onDay(d.day)} está sendo rebaixado`,
        evidence: conflictBefore
          ? `${c.minutes} min de ${c.machine} em intensidade ${c.intensity} antes de levantar.`
          : `${c.minutes} min de ${c.machine} intervalado depois de um dia de perna.`,
        proposal: conflictBefore
          ? "Ajustar para recuperação, ou mover o cardio para depois do treino."
          : "Ajustar para aeróbico — o intervalado rende mais em um dia de superiores.",
        rationale: conflictBefore
          ? "Cardio forte antes de levantar consome exatamente a energia que faltaria nas últimas séries: você perde carga sem ganhar condicionamento."
          : "Intervalado em cima de perna pesada é fadiga somada sem estímulo novo; o mesmo trabalho num dia de superiores rende bem mais.",
        patch: {
          kind: "strength_cardio_intensity",
          day: d.day,
          intensity: conflictBefore ? "recuperacao" : "aerobico",
        },
        actionLabel: "Ajustar intensidade",
      });
      break;
    }

    // 8. Stalled lifts — visible only because the athlete logs sets.
    //
    // One finding per exercise, with the load to try: "carga parada" as a list
    // of three names is a complaint; "agachamento há 5 sessões em 60 kg, tente
    // 65" is something you can act on between sets.
    for (const lift of input.liftProgress.filter(l => l.sessions >= 4 && l.deltaKg <= 0).slice(0, 3)) {
      const suggestion = lift.suggestedKg != null && lift.lastKg != null
        ? `Tente ${lift.suggestedKg} kg na próxima — você está em ${lift.lastKg} kg desde o começo.`
        : "Suba as repetições até o topo da faixa e então aumente o peso.";

      out.push({
        key: `carga_estagnada_${lift.exerciseId}`,
        area: "forca",
        severity: "media",
        title: `${lift.name}: carga parada`,
        evidence: `${lift.sessions} sessões registradas sem aumento de carga.`,
        proposal: suggestion,
        rationale:
          "Progressão dupla: primeiro suba as repetições até o topo da faixa, depois o peso. Estagnar com RIR alto " +
          "significa que falta intensidade; estagnar com RIR 0 significa que falta recuperação — e a saída é recuar para avançar.",
        patch: null,
      });
    }

    // 9. The same movements for months. Not wrong, but a plateau in disguise:
    //    the stimulus stops being novel long before the athlete notices.
    const stale = input.liftProgress.filter(l => l.weeksInPlan >= 12);
    if (stale.length >= 3) {
      out.push({
        key: `exercicios_repetidos_${stale.slice(0, 3).map(l => l.exerciseId).join("_")}`,
        area: "forca",
        severity: "baixa",
        title: "Os mesmos exercícios há mais de 3 meses",
        evidence: `${stale.length} movimentos sem variação desde ${stale[0].weeksInPlan} semanas atrás.`,
        proposal: "Troque um ou dois por variações do mesmo padrão — supino inclinado no lugar do reto, búlgaro no lugar do afundo.",
        rationale:
          "Variar o padrão a cada ~12 semanas renova o estímulo sem perder a especificidade, e reduz o desgaste " +
          "repetitivo em tendão e articulação. Trocar tudo de uma vez, por outro lado, apaga o histórico de carga — " +
          "por isso a sugestão é de um ou dois, não do treino inteiro.",
        patch: null,
      });
    }

    // 9. Prescribed but never logged — progression has nothing to stand on.
    if (input.strengthLogged.prescribed >= 6 && input.strengthLogged.logged === 0) {
      out.push({
        key: "sem_registro_forca",
        area: "forca",
        severity: "media",
        title: "Nenhum treino de força registrado",
        evidence: `${input.strengthLogged.prescribed} sessões prescritas nas últimas 3 semanas, nenhuma registrada.`,
        proposal: "Registre pelo menos as séries do exercício principal — leva 30 segundos no fim da sessão.",
        rationale:
          "Sem registro, a carga da próxima semana é chute. Com registro, o app aplica progressão dupla de verdade: " +
          "sobe repetição até o topo da faixa, depois sobe peso, e recua quando você trava.",
        patch: null,
      });
    }
  }

  // ── CORRIDA ──────────────────────────────────────────────────────────────

  // 10. Quality session immediately before the long run.
  const quality = planDays.filter(d => d.type === "tempo" || d.type === "intervals");
  if (longRun) {
    const collide = quality.find(q => gapForward(q.day as DayKey, longRun.day as DayKey) === 1);
    if (collide) {
      out.push({
        key: "qualidade_antes_longao",
        area: "corrida",
        severity: "media",
        title: `${collide.label} na véspera do longão`,
        evidence: `${collide.label} ${onDay(collide.day as DayKey)}, longão ${onDay(longRun.day as DayKey)} — sem folga entre as duas sessões mais duras da semana.`,
        proposal: "Separar as duas sessões duras com pelo menos um dia leve ou de descanso entre elas.",
        rationale:
          "As duas sessões mais importantes da semana coladas viram uma sessão dura e uma sessão arrastada. " +
          "Um dia de folga entre elas não reduz o volume — só garante que as duas rendam.",
        patch: null,
      });
    }
  }

  // 11. Volume flat for a long stretch with no race pressure.
  const active = weeklyKm.filter(v => v > 0);
  if (active.length >= 6 && !nextRace) {
    const recent = active.slice(0, 6);
    const max = Math.max(...recent), min = Math.min(...recent);
    if (max > 0 && (max - min) / max < 0.12) {
      out.push({
        key: "volume_estagnado",
        area: "corrida",
        severity: "baixa",
        title: "Volume estável há 6 semanas",
        evidence: `Entre ${min.toFixed(0)} e ${max.toFixed(0)} km por semana, sem variação real.`,
        proposal: "Marcar uma prova-alvo para o app montar a progressão, ou subir ~10% por 3 semanas e recuar na 4ª.",
        rationale:
          "O corpo se adapta ao que é repetido; volume constante mantém a forma mas não a constrói. " +
          "Progressão com semana de recuo a cada 4 é o padrão que sobe sem quebrar.",
        patch: null,
      });
    }
  }

  // 12. Volume climbing too fast — the classic route into injury.
  if (active.length >= 3) {
    const [w1, w2, w3] = active;
    if (w2 > 0 && w3 > 0) {
      const j1 = (w1 - w2) / w2, j2 = (w2 - w3) / w3;
      if (j1 > 0.15 && j2 > 0.15) {
        out.push({
          key: "salto_de_volume",
          area: "recuperacao",
          severity: "alta",
          title: "Volume subindo rápido demais",
          evidence: `${w3.toFixed(0)} → ${w2.toFixed(0)} → ${w1.toFixed(0)} km: dois saltos seguidos acima de 15%.`,
          proposal: "Segurar o volume desta semana no mesmo patamar, ou recuar ~20% por uma semana.",
          rationale:
            "Tecido conjuntivo se adapta bem mais devagar que o sistema cardiovascular: você sente que aguenta " +
            "antes de realmente aguentar. Subidas acima de ~10% por semana são o caminho mais comum para lesão por sobrecarga.",
          patch: null,
        });
      }
    }
  }

  // 13. Too much quality for the volume being run.
  const qualityPerWeek = prefs.qualityPerWeek ?? 1;
  const avgKm = active.length > 0 ? active.reduce((s, v) => s + v, 0) / active.length : 0;
  if (qualityPerWeek >= 2 && avgKm > 0 && avgKm < 30) {
    out.push({
      key: "qualidade_demais",
      area: "corrida",
      severity: "media",
      title: "Duas sessões de qualidade para o volume atual",
      evidence: `${qualityPerWeek} sessões fortes por semana com média de ${avgKm.toFixed(0)} km.`,
      proposal: "Voltar para 1 sessão forte por semana até o volume passar de ~30 km.",
      rationale:
        "Abaixo de ~30 km semanais, a maior parte do ganho ainda vem de volume aeróbico fácil. " +
        "Duas sessões duras nessa faixa comem a recuperação sem adicionar o estímulo que falta.",
      patch: { kind: "prefs_quality", qualityPerWeek: 1 },
      actionLabel: "Ajustar para 1×/semana",
    });
  }

  // 14. Long run too short for the target race.
  if (nextRace && longRun?.distance_km && nextRace.distance_km >= 21) {
    const days = daysUntil(nextRace.race_date);
    const share = avgKm > 0 ? longRun.distance_km / avgKm : 0;
    if (days > 21 && share > 0 && share < 0.22) {
      out.push({
        key: "longao_curto",
        area: "corrida",
        severity: "media",
        title: `Longão curto para ${nextRace.name}`,
        evidence: `${longRun.distance_km} km de longão, ${(share * 100).toFixed(0)}% do volume semanal, com ${nextRace.distance_km} km a ${days} dias.`,
        proposal: "Crescer o longão em ~2 km por semana até chegar perto de 30% do volume da semana.",
        rationale:
          "O longão é o que constrói resistência específica de prova longa. Entre 25% e 30% do volume semanal " +
          "é a faixa que rende sem virar sessão que exige a semana inteira para se recuperar.",
        patch: null,
      });
    }
  }

  // ── EXECUÇÃO: how the sessions are actually run ──────────────────────────

  // The most valuable finding the app can make, and one only visible by
  // comparing each kilometre against its target. Adherence says the session
  // happened; this says whether it was run the way it was designed.
  const habit = input.executionHabit;
  if (habit) {
    const share = `${habit.count} dos últimos ${habit.total} treinos analisados`;

    if (habit.key === "saiu_rapido") {
      out.push({
        key: "habito_saiu_rapido",
        area: "corrida",
        severity: "media",
        title: "Você começa rápido demais, com frequência",
        evidence: `${share} tiveram a segunda metade sensivelmente mais lenta que a primeira.`,
        proposal: "Nos primeiros 2 km, corra deliberadamente 10–15s/km mais devagar que o alvo e deixe o ritmo vir sozinho.",
        rationale:
          "Sair rápido gasta cedo o que faltaria no fim: o tempo final piora no mesmo esforço, e a sessão " +
          "cobra mais recuperação do que deveria. É o hábito isolado que mais separa quem evolui de quem estaciona.",
        patch: null,
      });
    } else if (habit.key === "rodagem_forte") {
      out.push({
        key: "habito_rodagem_forte",
        area: "recuperacao",
        severity: "alta",
        title: "Suas rodagens leves não estão leves",
        evidence: `${share} vieram acima da faixa de ritmo fácil.`,
        proposal: "Segure as rodagens no ritmo em que você consegue falar frases inteiras — mesmo que pareça devagar demais.",
        rationale:
          "Correr o fácil forte é a forma mais comum de treinar muito e evoluir pouco: você paga o custo de " +
          "recuperação de um treino de qualidade sem receber o estímulo de um, e chega cansado justamente nos dias que importam.",
        patch: null,
      });
    } else if (habit.key === "tiros_desabaram") {
      out.push({
        key: "habito_tiros_desabaram",
        area: "corrida",
        severity: "media",
        title: "Seus tiros desandam no fim",
        evidence: `${share} tiveram o último tiro bem mais lento que o primeiro.`,
        proposal: "Comece a série no ritmo que você sustentaria no último tiro — se o primeiro parecer fácil, está certo.",
        rationale:
          "Uma série boa termina no mesmo ritmo em que começou. Quando desaba, o problema quase nunca é o " +
          "último tiro fraco: é o primeiro rápido demais, e o estímulo de VO₂max se perde no meio do caminho.",
        patch: null,
      });
    }
  }

  // 15. The plan is more than the athlete is actually doing.
  if (input.adherence != null && input.adherence < 0.6 && prefs.runDays.length >= 4) {
    const trimmed = prefs.runDays.slice(0, prefs.runDays.length - 1);
    out.push({
      key: "aderencia_baixa",
      area: "recuperacao",
      severity: "media",
      title: "O plano está maior que a sua semana",
      evidence: `Você tem cumprido cerca de ${Math.round(input.adherence * 100)}% das sessões planejadas.`,
      proposal: `Reduzir para ${trimmed.length} dias de corrida — um plano que você cumpre vale mais que um plano bonito.`,
      rationale:
        "Consistência supera volume: 3 dias cumpridos toda semana constroem mais que 5 dias planejados e 2 feitos. " +
        "Reduzir o plano para caber na sua vida também tira a sensação de estar sempre devendo.",
      patch: { kind: "prefs_run_days", runDays: trimmed },
      actionLabel: `Reduzir para ${trimmed.length} dias`,
    });
  }

  const rank: Record<AdvisorSeverity, number> = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ── applying a finding ─────────────────────────────────────────────────────

export interface PatchResult {
  prefs:         TrainingPrefs;
  strengthPrefs: StrengthPrefs | null;
  changed:       boolean;
}

/**
 * Apply a patch to the athlete's configuration.
 *
 * Pure: returns new objects and never mutates the input, so a failed save
 * leaves the stored preferences untouched.
 */
export function applyAdvisorPatch(
  prefs: TrainingPrefs,
  strengthPrefs: StrengthPrefs | null,
  patch: AdvisorPatch,
): PatchResult {
  if (!patch) return { prefs, strengthPrefs, changed: false };

  const nextPrefs: TrainingPrefs = { ...prefs, runDays: [...prefs.runDays], strengthDays: [...prefs.strengthDays] };
  const nextStrength: StrengthPrefs | null = strengthPrefs
    ? { ...strengthPrefs, days: strengthPrefs.days.map(d => ({ ...d, muscles: [...d.muscles] })) }
    : null;

  switch (patch.kind) {
    case "strength_move_day": {
      if (!nextStrength) break;
      const day = nextStrength.days.find(d => d.day === patch.from);
      if (!day) break;
      if (nextStrength.days.some(d => d.day === patch.to)) break;   // target taken
      day.day = patch.to;
      nextStrength.days.sort((a, b) => idx(a.day) - idx(b.day));
      // Keep the running-plan view of strength days in step.
      nextPrefs.strengthDays = nextStrength.days.map(d => d.day);
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }

    case "strength_swap_days": {
      if (!nextStrength) break;
      const a = nextStrength.days.find(d => d.day === patch.a);
      const b = nextStrength.days.find(d => d.day === patch.b);
      if (!a || !b) break;
      // The days stay where they are; what they train trades places.
      const muscles = a.muscles; a.muscles = b.muscles; b.muscles = muscles;
      const cardio  = a.cardio ?? null; a.cardio = b.cardio ?? null; b.cardio = cardio;
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }

    case "strength_add_muscle": {
      if (!nextStrength) break;
      const day = nextStrength.days.find(d => d.day === patch.day);
      if (!day || day.muscles.includes(patch.muscle)) break;
      day.muscles.push(patch.muscle);
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }

    case "strength_remove_muscle": {
      if (!nextStrength) break;
      const day = nextStrength.days.find(d => d.day === patch.day);
      if (!day) break;
      const filtered = day.muscles.filter(m => m !== patch.muscle);
      if (filtered.length === 0 || filtered.length === day.muscles.length) break;
      day.muscles = filtered;
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }

    case "strength_cardio_intensity": {
      if (!nextStrength) break;
      const day = nextStrength.days.find(d => d.day === patch.day);
      if (!day?.cardio) break;
      day.cardio = { ...day.cardio, intensity: patch.intensity };
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }

    case "prefs_quality": {
      if (nextPrefs.qualityPerWeek === patch.qualityPerWeek) break;
      nextPrefs.qualityPerWeek = patch.qualityPerWeek;
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }

    case "prefs_long_run_day": {
      if (nextPrefs.longRunDay === patch.day) break;
      nextPrefs.longRunDay = patch.day;
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }

    case "prefs_run_days": {
      if (patch.runDays.length === 0) break;
      nextPrefs.runDays = [...patch.runDays].sort((a, b) => idx(a) - idx(b));
      if (nextPrefs.longRunDay && !nextPrefs.runDays.includes(nextPrefs.longRunDay)) {
        nextPrefs.longRunDay = null;
      }
      return { prefs: nextPrefs, strengthPrefs: nextStrength, changed: true };
    }
  }

  return { prefs, strengthPrefs, changed: false };
}

/** Muscle sets per week from raw logs, averaged over `weeks`. */
export function setsPerMuscleFromLogs(
  rows: Array<{ date: string; exercise_id: string }>,
  weeks = 4,
): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>();
  for (const r of rows) {
    const ex = exerciseById(r.exercise_id);
    if (!ex) continue;
    for (const m of ex.primary)   counts.set(m, (counts.get(m) ?? 0) + 1);
    for (const m of ex.secondary) counts.set(m, (counts.get(m) ?? 0) + 0.5);
  }
  const out = new Map<MuscleGroup, number>();
  counts.forEach((total, m) => out.set(m, total / weeks));
  return out;
}
