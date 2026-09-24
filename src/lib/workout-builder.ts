/**
 * Deterministic workout engine.
 *
 * Sessions are COMPUTED from the athlete's VDOT and LTHR — not invented by a
 * language model — so paces, heart-rate windows and volumes are reproducible and
 * respect the published limits. See TRAINING_SCIENCE.md for the sources.
 *
 * Volume caps applied (Daniels, as % of weekly volume):
 *   long run ≤ 25–30% · threshold ≤ 10% · intervals ≤ 8% (and ≤ 10 km)
 *
 * Heart-rate windows follow Friel's % of LTHR.
 */
import type {
  WorkoutStep, WorkoutBlock, StructuredWorkout, WeeklyPlanDay, HrTarget, KmSplit, TrainingPrefs,
} from "@/types";
import { isRepeatBlock } from "@/types";
import type { TrainingPace } from "@/lib/performance";
import { buildStrengthSession, type Phase } from "@/lib/strength-builder";
import { strengthBlockFor, runningLoadFactor } from "@/lib/strength-cycle";
import type { StrengthPrefs } from "@/lib/strength-prefs";
import { MUSCLE_LABEL } from "@/lib/exercises";
import { isSecondarySport, sessionMinutes, SPORTS, type SecondarySport } from "@/lib/sports";
import { qualityForWeek, repBonusForCycle, EXCLUDABLE_QUALITY } from "@/lib/mesocycle";

// ─── Heart-rate windows (Friel, % of LTHR) ───────────────────────────────────

const HR_BANDS: Record<"E" | "M" | "T" | "I" | "R", { lo: number; hi: number; zone: string; label: string }> = {
  E: { lo: 0.80, hi: 0.89, zone: "Z2",  label: "Aeróbico" },
  M: { lo: 0.89, hi: 0.94, zone: "Z3",  label: "Maratona" },
  T: { lo: 0.94, hi: 0.99, zone: "Z4",  label: "Limiar" },
  I: { lo: 1.00, hi: 1.06, zone: "Z5",  label: "VO₂max" },
  R: { lo: 1.00, hi: 1.10, zone: "Z5+", label: "Velocidade" },
};

/** HR window for an intensity, or undefined when the athlete has no LTHR yet. */
export function hrFor(intensity: keyof typeof HR_BANDS, lthr: number | null): HrTarget | undefined {
  if (!lthr) return undefined;
  const b = HR_BANDS[intensity];
  return { min: Math.round(lthr * b.lo), max: Math.round(lthr * b.hi), zone: b.zone, label: b.label };
}

// ─── Pace helpers ────────────────────────────────────────────────────────────

function secToPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type PaceName = "recovery" | "easy" | "marathon" | "threshold" | "interval" | "repetition";

interface PaceLookup {
  range: (name: PaceName) => string | undefined;
  mid:   (name: PaceName) => number | undefined;   // sec/km
}

function paceLookup(paces: TrainingPace[] | null): PaceLookup {
  const find = (name: PaceName) => paces?.find(p => p.name === name);
  return {
    range: (name) => {
      const p = find(name);
      return p ? `${secToPace(p.pace_max_sec)}–${secToPace(p.pace_min_sec)}/km` : undefined;
    },
    mid: (name) => {
      const p = find(name);
      return p ? Math.round((p.pace_min_sec + p.pace_max_sec) / 2) : undefined;
    },
  };
}

// ─── Session builders ────────────────────────────────────────────────────────

export interface WeekContext {
  /**
   * Build this kind of quality session instead of the rotation's pick. Used
   * when the athlete adapts a session and needs a specific alternative.
   */
  forceQuality?: import("@/lib/mesocycle").QualityKind;
  /** Quality sessions the athlete opted out of; the rotation skips them. */
  excludedQuality?: import("@/lib/mesocycle").QualityKind[];
  /** Monday of the week being built (YYYY-MM-DD) — anchors the strength block. */
  weekStart?: string;
  /** The athlete's recent average running volume, for the load comparison. */
  recentAverageKm?: number;
  /** Total planned running volume for the week, in km. */
  weeklyKm:  number;
  /** Training paces from the latest test (null → paces omitted). */
  paces:     TrainingPace[] | null;
  /** Running LTHR (null → HR windows omitted). */
  lthr:      number | null;
  /** Periodization phase — shifts the emphasis of the quality session. */
  phase?:    "base" | "build" | "peak" | "taper" | "race";
  /** Race distance being trained for, when known. */
  targetRaceKm?: number | null;
  /**
   * The longest run the athlete has actually completed in the past year.
   *
   * Long-run durability decays far more slowly than weekly volume: someone who
   * has covered 21 km does not lose the ability to run 8 after a quiet month.
   * Sizing the long run purely off a depressed weekly average produced 5 km
   * long runs for a half-marathoner.
   */
  provenLongRunKm?: number | null;
  /** Athlete-stated floors from training preferences. */
  minRunKm?: number | null;
  minLongRunKm?: number | null;
  /**
   * Position inside the four-week block (1..4), from `lib/mesocycle`.
   *
   * Without it the quality session is a pure function of weekly volume, so a
   * volume that does not move produces a session that does not move — six
   * identical "Tiro 3×400 m" weeks in Sérgio's plan. Daniels caps interval
   * volume at 8% of the week, which at 19 km is reached at three 400s, so
   * progression at a flat volume cannot come from more reps. It comes from what
   * kind of hard work is done, and how dense it is.
   */
  cycleWeek?: number;
  /**
   * A quarta semana do bloco, mais leve por desenho.
   *
   * Muda duas coisas: a semana pode ter menos corridas (em vez de corridas
   * abaixo do mínimo do atleta), e o recado diz que ela é de recuperação.
   */
  isRecovery?: boolean;
  /** 1-based block number, for progression that spans blocks. */
  cycleNumber?: number;
  /**
   * The 3 km test is owed this week.
   *
   * It had only ever been asked for by push notification, and a push competes
   * with the lock screen and loses — four of the app's six athletes had never
   * done one, so their plans carried structure and volume but no paces at all.
   * A session on Wednesday is not so easy to dismiss.
   */
  testDue?: boolean;
}

const round05 = (n: number) => Math.round(n * 2) / 2;

/**
 * Below this, a week's total is noise rather than training — a stray GPS
 * recording, a watch left on in the car, a 300 m walk to the bakery.
 */
const MIN_TRAINING_WEEK_KM = 3;

/**
 * Distance covered during a timed recovery, in kilometres.
 *
 * The prescribed `distance_km` used to count only the fast reps, the warm-up
 * and the cool-down — the jog between reps was invisible. So a session written
 * as "3,5 km" had the athlete cover about 4,6, and the watch, which follows the
 * structure rather than the label, disagreed with the card that produced it.
 *
 * A number the plan prints and the watch contradicts is worse than no number.
 */
function recoveryKm(minutes: number, recoveryPaceSecKm: number | null): number {
  const pace = recoveryPaceSecKm && recoveryPaceSecKm > 0 ? recoveryPaceSecKm : 420; // ~7:00/km
  return (minutes * 60) / pace;
}

/**
 * Easy run — the smallest of the three sessions.
 * ~18–20% of weekly volume, entirely at E pace.
 */
export function buildEasyRun(
  ctx: WeekContext,
  /** Explicit distance from the week's volume split; falls back to a share. */
  distanceKm?: number,
): { day: Partial<WeeklyPlanDay>; structure: StructuredWorkout } {
  const p = paceLookup(ctx.paces);
  const km = Math.max(3, round05(distanceKm ?? ctx.weeklyKm * 0.19));
  const hr = hrFor("E", ctx.lthr);

  const structure: StructuredWorkout = {
    blocks: [{
      kind: "run",
      distance_km: km,
      pace: p.range("easy"),
      hr,
      intensity: "E",
      note: "Ritmo de conversa. Se não conseguir falar frases inteiras, está rápido demais.",
    }],
  };

  return {
    day: {
      type: "easy",
      label: "Rodagem leve",
      distance_km: km,
      pace: p.range("easy"),
      description:
        `Rodagem tranquila de ${km} km em ritmo fácil. É o treino que constrói base aeróbica sem custo de recuperação — ` +
        `resista à tentação de acelerar${hr ? `. Mantenha a FC entre ${hr.min} e ${hr.max} bpm (${hr.zone})` : ""}.`,
    },
    structure,
  };
}

/**
 * Interval session (I pace). Reps of 3–5 min with jog recovery of similar
 * duration; total quality volume capped at 8% of the week (and 10 km).
 */
export function buildIntervalRun(
  ctx: WeekContext,
  /**
   * Quilômetros que a rodagem recusou (ver `distributeWeeklyVolume`).
   *
   * Entram como aquecimento e desaquecimento, que é onde volume fácil cabe num
   * dia de tiro sem mudar o estímulo: as séries continuam as mesmas.
   */
  extraKm = 0,
): { day: Partial<WeeklyPlanDay>; structure: StructuredWorkout } {
  const p = paceLookup(ctx.paces);
  const hrI = hrFor("I", ctx.lthr);
  const hrE = hrFor("E", ctx.lthr);
  const hrT = hrFor("T", ctx.lthr);

  // Daniels: I volume ≤ 8% of weekly mileage, never above 10 km.
  const qualityBudget = Math.min(ctx.weeklyKm * 0.08, 10);

  /*
   * What kind of hard session this week gets.
   *
   * Peak and taper still force threshold — it holds fitness with less damage
   * than VO2max when a race is close, and that outranks the block's rotation.
   * Otherwise the mesocycle decides, so consecutive weeks differ even when the
   * volume does not.
   */
  const kind = ctx.forceQuality ?? ((ctx.phase === "taper" || ctx.phase === "peak")
    ? "threshold"
    : qualityForWeek(ctx.cycleWeek ?? 1, ctx.cycleNumber ?? 1, ctx.excludedQuality ?? []));
  const useThreshold = kind === "threshold";
  const dense  = kind === "intervals_dense";
  const easyWeek = kind === "strides";

  const warmup = Math.max(1.5, round05(ctx.weeklyKm * 0.06)) + round05(extraKm * 0.6);
  const cool   = Math.max(1, round05(ctx.weeklyKm * 0.04)) + round05(extraKm * 0.4);

  let blocks: WorkoutBlock[];
  let label: string;
  let description: string;
  let totalKm: number;

  const hrR = hrFor("I", ctx.lthr);   // R pace peaks around the I window

  if (ctx.testDue) {
    /*
     * The test *is* this week's hard session.
     *
     * Three kilometres at the strongest sustainable effort costs about what an
     * interval session costs, so scheduling both would give the athlete two hard
     * days and a worse test. It replaces the quality work rather than joining it.
     *
     * Placement in the block's first week is deliberate and handled by the
     * caller: testing on tired legs measures fatigue, not fitness.
     */
    blocks = [
      { kind: "warmup", distance_km: Math.max(2, warmup), pace: p.range("easy"), hr: hrE, intensity: "E", note: "10–15 min bem leves. Aqueça de verdade — o teste começa rápido." },
      { kind: "run", distance_km: 3, pace: p.range("threshold"), hr: hrT, intensity: "T", note: "Forte e SUSTENTÁVEL: sem sobrar no fim, sem apagar no meio." },
      { kind: "cooldown", distance_km: Math.max(1, cool), pace: p.range("easy"), hr: hrE, intensity: "E", note: "Trote solto para fechar." },
    ];
    label = "Teste de 3 km";
    totalKm = round05(Math.max(2, warmup) + 3 + Math.max(1, cool));
    description =
      `Teste de 3 km — é ele que calibra todo o resto do app. Corra no ritmo mais forte que você ` +
      `consegue SUSTENTAR pelos 3 km inteiros: sem sobrar no fim, sem apagar no meio. ` +
      `Terreno plano, de preferência o mesmo de sempre. Anote o tempo total e a FC média — ` +
      `é a FC que libera suas zonas. Depois dele, ritmos, previsões e o conselheiro passam a valer.`;

  } else if (kind === "repetitions") {
    /*
     * Repetition pace — short, fast, fully recovered.
     *
     * The stimulus is neuromuscular, not aerobic: 200 m at R teaches the legs to
     * turn over and the stride to stay long, and because recovery is complete
     * the session costs almost nothing in fatigue. Daniels caps R volume near 5%
     * of the week, which is why this reads as few reps at Sérgio's volume — the
     * cap is the point, not a limitation to route around.
     */
    const repKm = 0.2;
    const budget = Math.min(ctx.weeklyKm * 0.05, 8);
    const reps = Math.max(6, Math.min(12, Math.floor(budget / repKm)));
    blocks = [
      { kind: "warmup", distance_km: warmup, pace: p.range("easy"), hr: hrE, intensity: "E", note: "Aqueça bem — tiro curto em perna fria é lesão." },
      {
        repeat: reps,
        steps: [
          { kind: "run",      distance_km: repKm, pace: p.range("repetition"), hr: hrR, intensity: "R", note: "Rápido e leve. Sem forçar o rosto, sem encurtar a passada." },
          { kind: "recovery", duration_min: 2,    pace: p.range("recovery"),   hr: hrE, intensity: "E", note: "Recuperação completa — aqui descansar é parte do treino." },
        ],
      },
      { kind: "cooldown", distance_km: cool, pace: p.range("easy"), hr: hrE, intensity: "E" },
    ];
    label = `Tiros curtos ${reps}×200 m`;
    totalKm = warmup + reps * repKm + cool;
    description =
      `${reps} tiros de 200 m em ritmo de repetição, com 2 min de recuperação completa entre eles. ` +
      `Não é treino de fôlego: o objetivo é velocidade de pernas e economia de corrida. ` +
      `Se você chegar ofegante no fim de cada tiro, foi rápido demais — deveria terminar rápido e solto.`;

  } else if (kind === "hills") {
    /*
     * Hill repeats — strength work that happens to be running.
     *
     * Force production without the joint cost of flat speed, and the gradient
     * enforces good mechanics on its own. Useful precisely because it progresses
     * the athlete on an axis that has nothing to do with adding kilometres.
     */
    const reps = Math.max(6, Math.min(12, Math.round(ctx.weeklyKm / 3)));
    blocks = [
      { kind: "warmup", distance_km: warmup, pace: p.range("easy"), hr: hrE, intensity: "E", note: "Aqueça no plano antes de ir para a subida." },
      {
        repeat: reps,
        steps: [
          { kind: "run",      duration_min: 0.75, pace: p.range("interval"), hr: hrI, intensity: "I", note: "Subida forte, tronco ereto, passada curta e ativa." },
          { kind: "recovery", duration_min: 2,    pace: p.range("recovery"), hr: hrE, intensity: "E", note: "Desça trotando ou caminhando, sem pressa." },
        ],
      },
      { kind: "cooldown", distance_km: cool, pace: p.range("easy"), hr: hrE, intensity: "E" },
    ];
    label = `Subidas ${reps}×45 s`;
    totalKm = round05(warmup + cool + reps * 0.18);
    description =
      `${reps} subidas de 45 s em esforço forte, descendo em recuperação. Procure uma ladeira constante de 4-6%. ` +
      `É treino de força específica: ganha-se potência sem o impacto da velocidade no plano. ` +
      `O ritmo não importa aqui — o esforço, sim.`;

  } else if (kind === "fartlek") {
    /*
     * Fartlek — surges inside an easy run.
     *
     * Trains the transitions a race actually demands: changing gear, then
     * recovering while still moving. Structured intervals never rehearse that,
     * because the recovery there is a stop rather than a slower run.
     */
    const reps = Math.max(4, Math.min(10, Math.round(ctx.weeklyKm / 4)));
    blocks = [
      { kind: "warmup", distance_km: warmup, pace: p.range("easy"), hr: hrE, intensity: "E", note: "Comece solto." },
      {
        repeat: reps,
        steps: [
          { kind: "run",      duration_min: 2, pace: p.range("threshold"), hr: hrT, intensity: "T", note: "Acelere para um ritmo forte porém controlado." },
          { kind: "recovery", duration_min: 2, pace: p.range("easy"),      hr: hrE, intensity: "E", note: "Volte ao ritmo leve sem parar — recuperar correndo é o treino." },
        ],
      },
      { kind: "cooldown", distance_km: cool, pace: p.range("easy"), hr: hrE, intensity: "E" },
    ];
    label = `Fartlek ${reps}×2 min`;
    totalKm = round05(warmup + cool + reps * 0.7);
    description =
      `${reps} acelerações de 2 min em ritmo forte, com 2 min de corrida leve entre elas — sem parar em nenhum momento. ` +
      `O ganho está na troca de marcha e em se recuperar correndo, que é o que uma prova cobra ` +
      `e que o tiro com parada nunca ensaia.`;

  } else if (kind === "progression") {
    /*
     * Progressive run — one continuous effort that finishes at threshold.
     *
     * The discipline it teaches is starting slower than you want to. An athlete
     * who can only run one pace blows up in the second half of every race, and
     * no amount of interval work fixes that on its own.
     */
    const km = round05(Math.max(5, Math.min(12, ctx.weeklyKm * 0.25)));
    const terco = round05(km / 3);
    blocks = [
      { kind: "run", distance_km: terco,           pace: p.range("easy"),      hr: hrE, intensity: "E", note: "Primeiro terço bem leve — mais leve do que apetece." },
      { kind: "run", distance_km: round05(km - 2 * terco), pace: p.range("marathon") ?? p.range("easy"), hr: hrE, intensity: "M", note: "Segundo terço: acelere um degrau, ainda confortável." },
      { kind: "run", distance_km: terco,           pace: p.range("threshold"), hr: hrT, intensity: "T", note: "Último terço em ritmo de limiar. Termine forte, não estourado." },
    ];
    label = `Progressivo ${km} km`;
    totalKm = km;
    description =
      `${km} km em três terços, acelerando a cada um: leve, moderado e limiar no final. ` +
      `A parte difícil é o começo — quem sai rápido não consegue progredir e o treino perde o sentido. ` +
      `Ensina o controle de ritmo que decide a segunda metade de uma prova.`;

  } else if (easyWeek) {
    /*
     * The block's recovery week.
     *
     * Not "no quality" — a week with nothing fast in it costs neuromuscular
     * sharpness and makes the return to intervals feel like starting over.
     * Strides are the standard answer: 20 seconds at repetition pace is too
     * short to accumulate meaningful fatigue, while still asking the legs to
     * turn over quickly. Full walking recovery, because the point is quality of
     * movement, not stress.
     */
    const reps = 6;
    blocks = [
      { kind: "warmup", distance_km: warmup, pace: p.range("easy"), hr: hrE, intensity: "E", note: "Semana leve — aqueça sem pressa." },
      {
        repeat: reps,
        steps: [
          { kind: "run",      duration_min: 0.5, pace: p.range("repetition"), hr: hrI, intensity: "R", note: "Rápido e solto, sem tensionar. Não é tiro." },
          { kind: "recovery", duration_min: 1,   pace: p.range("recovery"),   hr: hrE, intensity: "E", note: "Caminhe ou trote até respirar normal." },
        ],
      },
      { kind: "cooldown", distance_km: cool, pace: p.range("easy"), hr: hrE, intensity: "E" },
    ];
    label = `Leve + ${reps} tiros curtos`;
    totalKm = warmup + cool + 0.6;
    description =
      `Semana de recuperação do bloco. Rodagem leve com ${reps} tiros curtos de 20 s bem soltos, ` +
      `com recuperação completa entre eles. Serve para manter a mecânica rápida sem gerar fadiga — ` +
      `se terminar cansado, foi rápido demais.`;
  } else if (useThreshold) {
    // Cruise intervals: 5–8 min at T with 1 min jog.
    const repKm  = 1.6;
    const reps   = Math.max(2, Math.min(5, Math.round((ctx.weeklyKm * 0.10) / repKm)));
    blocks = [
      { kind: "warmup", distance_km: warmup, pace: p.range("easy"), hr: hrE, intensity: "E", note: "Solte as pernas, progressivo." },
      {
        repeat: reps,
        steps: [
          { kind: "run",      distance_km: repKm, pace: p.range("threshold"), hr: hrT, intensity: "T", note: "Esforço controlado, sustentável — não é tiro." },
          { kind: "recovery", duration_min: 1,    pace: p.range("recovery"),  hr: hrE, intensity: "E", note: "Trote leve." },
        ],
      },
      { kind: "cooldown", distance_km: cool, pace: p.range("easy"), hr: hrE, intensity: "E" },
    ];
    label = `Tempo ${reps}×${repKm} km`;
    totalKm = warmup + reps * repKm + cool;
    description =
      `${reps} blocos de ${repKm} km em ritmo de limiar com 1 min de trote entre eles. ` +
      `O limiar é o ritmo que você sustentaria por ~1 hora numa prova: forte, porém controlado` +
      `${hrT ? `, FC entre ${hrT.min} e ${hrT.max} bpm` : ""}.`;
  } else {
    // Classic VO2max intervals: 1000 m reps ≈ 3–5 min, jog recovery of similar
    // duration.
    //
    // The rep distance has to follow the week's volume. Three 1000 m reps plus
    // warm-up and cool-down is 5.5 km however small the week is — at 12 km a
    // week that made the quality session bigger than the long run, and blew
    // past Daniels' 8% cap on interval volume. Shorter reps keep the stimulus
    // while respecting the cap.
    const repKm = ctx.weeklyKm < 20 ? 0.4 : ctx.weeklyKm < 30 ? 0.6 : 1;
    const baseReps = Math.max(3, Math.min(8, Math.floor(qualityBudget / repKm)));

    /*
     * Blocks already completed earn reps — but only when the 8% cap has room
     * for them. Breaching the cap to manufacture a sense of progress would be
     * trading a real safety rule for a cosmetic one.
     */
    const bonus = repBonusForCycle(ctx.cycleNumber ?? 1);
    const reps = (baseReps + bonus) * repKm <= qualityBudget
      ? Math.min(8, baseReps + bonus)
      : baseReps;

    const repSec = p.mid("interval") ? Math.round(p.mid("interval")! * repKm) : null;
    /*
     * Recovery is 70% of rep time normally (Daniels allows 50–90%), and 50% in
     * the block's third week. Cutting the jog is how an interval session gets
     * harder without adding a metre of I-pace volume — the only progression
     * available when the cap is already reached.
     */
    const recoveryFrac = dense ? 0.5 : 0.7;
    const recoveryMin = repSec ? Math.max(1, Math.round((repSec * recoveryFrac) / 30) / 2) : 2.5;

    blocks = [
      { kind: "warmup", distance_km: warmup, pace: p.range("easy"), hr: hrE, intensity: "E", note: "Aquecimento progressivo antes dos tiros." },
      {
        repeat: reps,
        steps: [
          { kind: "run",      distance_km: repKm,           pace: p.range("interval"), hr: hrI, intensity: "I", note: "Forte e uniforme — o último tiro deve sair no mesmo ritmo do primeiro." },
          { kind: "recovery", duration_min: recoveryMin,    pace: p.range("recovery"), hr: hrE, intensity: "E", note: "Trote de recuperação, não pare." },
        ],
      },
      { kind: "cooldown", distance_km: cool, pace: p.range("easy"), hr: hrE, intensity: "E" },
    ];
    label = `Tiro${dense ? " denso" : ""} ${reps}×${repKm * 1000} m`;
    totalKm = warmup + reps * repKm + cool;
    description =
      `${reps} tiros de ${repKm * 1000} m em ritmo de VO₂max, com ${recoveryMin} min de trote entre eles. ` +
      /*
       * The honest total, spelled out.
       *
       * The headline distance counts running volume — warm-up, reps and
       * cool-down — because that is what the week's budget is built from. The
       * jog between reps is real distance the athlete covers and the watch
       * counts, so a session labelled 3,5 km shows up on the Garmin as more.
       * Saying the number here costs nothing and stops the plan and the watch
       * from appearing to disagree.
       */
      `Com os trotes, dá cerca de ${round05(totalKm + reps * recoveryKm(recoveryMin, p.mid("recovery") ?? null))} km no relógio. ` +
      (dense
        ? `Esta é a semana densa do bloco: mesma distância, menos trote — a recuperação encurtada é o que aumenta o estímulo. `
        : "") +
      `Ritmo de tiro é o que você sustentaria por ~10-12 min numa prova` +
      `${hrI ? `; a FC deve chegar a ${hrI.min}-${hrI.max} bpm no fim de cada tiro` : ""}. ` +
      `Aquecimento e desaquecimento são parte do treino, não opcionais.`;
  }

  return {
    day: {
      type: ctx.testDue ? "test" : useThreshold ? "tempo" : "intervals",
      // Which session this is, so an adaptation knows what it is replacing
      // without reading it back out of the label.
      quality: ctx.testDue ? undefined : kind,
      label,
      distance_km: round05(totalKm),
      pace: useThreshold ? p.range("threshold") : p.range("interval"),
      description,
    },
    structure: { blocks },
  };
}

/**
 * Long run — the biggest session of the week, capped at 25–30% of volume.
 * In build/peak, finishes with a stretch at marathon pace for race specificity.
 */
export function buildLongRun(
  ctx: WeekContext,
  /** Explicit distance from the week's volume split; falls back to a share. */
  distanceKm?: number,
): { day: Partial<WeeklyPlanDay>; structure: StructuredWorkout } {
  const p = paceLookup(ctx.paces);
  const hrE = hrFor("E", ctx.lthr);
  const hrM = hrFor("M", ctx.lthr);

  const share = ctx.phase === "taper" ? 0.20 : ctx.phase === "peak" ? 0.30 : 0.26;
  let km = Math.max(5, round05(distanceKm ?? ctx.weeklyKm * share));

  // Never longer than the race itself (outside marathon training).
  if (ctx.targetRaceKm && ctx.targetRaceKm < 42 && km > ctx.targetRaceKm * 1.2) {
    km = round05(ctx.targetRaceKm * 1.2);
  }

  // Race-specific finish once the athlete is past the base phase.
  const withMarathonFinish =
    (ctx.phase === "build" || ctx.phase === "peak") && km >= 10 && !!p.range("marathon");

  const blocks: WorkoutBlock[] = withMarathonFinish
    ? [
        { kind: "run", distance_km: round05(km - 3), pace: p.range("easy"), hr: hrE, intensity: "E",
          note: "Ritmo confortável — o objetivo é tempo em pé, não velocidade." },
        { kind: "run", distance_km: 3, pace: p.range("marathon"), hr: hrM, intensity: "M",
          note: "Últimos 3 km em ritmo de prova, correndo já cansado." },
      ]
    : [
        { kind: "run", distance_km: km, pace: p.range("easy"), hr: hrE, intensity: "E",
          note: "Ritmo constante e fácil do início ao fim." },
      ];

  return {
    day: {
      type: "long_run",
      label: "Longão",
      distance_km: km,
      pace: p.range("easy"),
      description: withMarathonFinish
        ? `Longão de ${km} km: ${round05(km - 3)} km em ritmo fácil e os últimos 3 km em ritmo de maratona. ` +
          `Terminar forte com fadiga acumulada é o que treina a prova de verdade.`
        : `Longão de ${km} km em ritmo fácil${hrE ? `, FC entre ${hrE.min} e ${hrE.max} bpm` : ""}. ` +
          `O ganho vem do tempo em pé — se precisar desacelerar para manter o esforço fácil, desacelere.`,
    },
    structure: { blocks },
  };
}

// ─── Week assembly ───────────────────────────────────────────────────────────

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_PT: Record<WeeklyPlanDay["day"], string> = {
  Mon: "Segunda", Tue: "Terça", Wed: "Quarta", Thu: "Quinta",
  Fri: "Sexta", Sat: "Sábado", Sun: "Domingo",
};

/** Sensible starting layout for an athlete who hasn't chosen their days yet. */
export const DEFAULT_PREFS: TrainingPrefs = {
  runDays:      ["Tue", "Thu", "Sat"],
  strengthDays: ["Mon", "Wed", "Fri"],
  longRunDay:   null,
  qualityPerWeek: 1,
};

function cleanDays(input: unknown): WeeklyPlanDay["day"][] {
  if (!Array.isArray(input)) return [];
  const valid = input.filter((d): d is WeeklyPlanDay["day"] =>
    DAY_ORDER.includes(d as WeeklyPlanDay["day"]));
  return Array.from(new Set(valid)).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

/** Fill in anything missing so the generator always receives a usable layout. */
export function normalizePrefs(raw: unknown): TrainingPrefs {
  const p = (raw ?? {}) as Partial<TrainingPrefs>;
  const runDays = cleanDays(p.runDays);
  const strengthDays = cleanDays(p.strengthDays);
  const quality = Number(p.qualityPerWeek);

  return {
    runDays:      runDays.length > 0 ? runDays : DEFAULT_PREFS.runDays,
    strengthDays: strengthDays.length > 0 ? strengthDays : DEFAULT_PREFS.strengthDays,
    // A long run day the athlete doesn't run on is meaningless — the allocator
    // would ignore it anyway, so don't store an inconsistent preference.
    longRunDay:   DAY_ORDER.includes(p.longRunDay as WeeklyPlanDay["day"])
                    && (runDays.length > 0 ? runDays : DEFAULT_PREFS.runDays)
                       .includes(p.longRunDay as WeeklyPlanDay["day"])
                    ? (p.longRunDay as WeeklyPlanDay["day"]) : null,
    qualityPerWeek: Number.isFinite(quality) && quality >= 0 && quality <= 3
                    ? Math.round(quality) : 1,
    runDaysConfirmed: p.runDaysConfirmed === true,
    // Whitelists that forget a field drop it silently — the same failure that
    // once stripped `strength` off every plan on read. Both floors are clamped
    // to something a human could plausibly mean rather than trusted raw.
    minRunKm:     clampKm(p.minRunKm, 1, 15) ?? 5,
    minLongRunKm: clampKm(p.minLongRunKm, 3, 42),
    otherDays:    cleanOtherDays(p.otherDays),
    excludedQuality: cleanExcludedQuality(p.excludedQuality),
    lightDays:    cleanDays(p.lightDays),
  };
}

/** Only kinds that are safe to drop, each at most once. */
function cleanExcludedQuality(input: unknown): NonNullable<TrainingPrefs["excludedQuality"]> {
  if (!Array.isArray(input)) return [];
  return EXCLUDABLE_QUALITY.filter(kind => input.includes(kind));
}

/**
 * Sanitize the tier-2 schedule: known sports only, real days only, no empties.
 *
 * Sports whose day list comes back empty are dropped rather than kept as `[]` —
 * a sport scheduled on no days is not scheduled, and leaving the key around
 * makes every consumer re-check the same emptiness.
 */
function cleanOtherDays(input: unknown): TrainingPrefs["otherDays"] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const out: NonNullable<TrainingPrefs["otherDays"]> = {};
  for (const [sport, days] of Object.entries(input as Record<string, unknown>)) {
    if (!isSecondarySport(sport)) continue;
    const clean = cleanDays(days);
    if (clean.length > 0) out[sport] = clean;
  }
  return out;
}

/** The tier-2 sports scheduled on a given day, in the order they were picked. */
export function otherSportsOn(
  prefs: TrainingPrefs,
  day: WeeklyPlanDay["day"],
): SecondarySport[] {
  return Object.entries(prefs.otherDays ?? {})
    .filter(([sport, days]) => isSecondarySport(sport) && (days ?? []).includes(day))
    .map(([sport]) => sport as SecondarySport);
}

/** A distance preference, or null when it is missing or nonsense. */
function clampKm(value: unknown, lo: number, hi: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(n, lo), hi);
}

/** True when the athlete is running on the defaults rather than their own choice. */
export function isDefaultRunWeek(prefs: TrainingPrefs): boolean {
  if (prefs.runDaysConfirmed) return false;
  // Someone whose days already differ from the template clearly picked them,
  // even if they predate the confirmation flag — don't nag them.
  return prefs.runDays.length === DEFAULT_PREFS.runDays.length
    && prefs.runDays.every((d, i) => d === DEFAULT_PREFS.runDays[i]);
}

/**
 * Decide which kind of run goes on each chosen day.
 *
 * The athlete's preferred progression is easy → quality → long, so the sessions
 * are laid out in that order across the days they picked. The long run always
 * lands on the designated day (or the last one), and extra days become easy
 * runs — which is what keeps the week aerobic as frequency grows.
 */
export function allocateRunSessions(
  runDays: WeeklyPlanDay["day"][],
  opts: { longRunDay?: WeeklyPlanDay["day"] | null; qualityPerWeek?: number; lightDays?: WeeklyPlanDay["day"][] } = {},
): Map<WeeklyPlanDay["day"], "easy" | "quality" | "long"> {
  const days = [...runDays].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const out = new Map<WeeklyPlanDay["day"], "easy" | "quality" | "long">();
  if (days.length === 0) return out;
  // Days the athlete asked to keep light do not carry the quality session while
  // another day can (see below). The long run never moves for it: it closes the
  // week, and choosing its day is what "Minha semana" is for.
  const light = new Set(opts.lightDays ?? []);

  // Long run: the athlete's choice if it's a running day, else the last one.
  const longDay = opts.longRunDay && days.includes(opts.longRunDay)
    ? opts.longRunDay
    : days[days.length - 1];

  const rest = days.filter(d => d !== longDay);

  // With a single run, that run is the long one — quality needs a base first.
  if (rest.length === 0) {
    out.set(longDay, "long");
    return out;
  }

  // How many quality sessions fit: never more than half the remaining runs, and
  // always leaving at least one easy run, so the week stays predominantly easy
  // (Daniels' 80/20). With only two runs a week that means easy + long — at
  // that frequency aerobic volume builds more than intervals do, and a week of
  // "one hard, one long" leaves nowhere for the easy volume to go.
  const requested = opts.qualityPerWeek ?? (days.length >= 5 ? 2 : 1);
  const qualityCount = Math.max(0, Math.min(
    requested,
    Math.ceil(rest.length / 2),
    rest.length - 1,
  ));

  if (qualityCount === 0) {
    for (const d of rest) out.set(d, "easy");
    out.set(longDay, "long");
    return out;
  }

  // The athlete's progression is easy → quality → long, so quality sits AFTER
  // the first easy run and BEFORE the long run — never immediately before it.
  const adjacentBeforeLong = (d: WeeklyPlanDay["day"]) =>
    DAY_ORDER.indexOf(longDay) - DAY_ORDER.indexOf(d) === 1;

  let candidates = rest.filter(d => !adjacentBeforeLong(d));
  if (candidates.length < qualityCount) candidates = [...rest];
  /*
   * A light day moves the quality session only to a day that keeps the week's
   * order — not the first run (easy opens the week) and not the eve of the long
   * run. When no such day exists the light preference yields: the athlete's
   * leve → tiro → longão is a rule, a lighter Wednesday is a wish.
   */
  if (light.size > 0) {
    const clean = rest.filter(d => !adjacentBeforeLong(d) && !light.has(d) && d !== rest[0]);
    if (clean.length >= qualityCount) candidates = clean;
  }

  // The first run of the week absorbs the previous long run — keep it easy when
  // there are other days available.
  if (candidates.length > qualityCount && candidates[0] === rest[0]) {
    const trimmed = candidates.slice(1);
    if (trimmed.length >= qualityCount) candidates = trimmed;
  }

  const qualityDays = new Set(pickSpread(candidates, qualityCount));

  for (const d of rest) out.set(d, qualityDays.has(d) ? "quality" : "easy");
  out.set(longDay, "long");
  return out;
}

/** Pick `count` days spread as evenly as possible across the list. */
function pickSpread<T>(list: T[], count: number): T[] {
  if (count >= list.length) return [...list];
  if (count === 1) return [list[Math.floor((list.length - 1) / 2)]];
  const out: T[] = [];
  const step = (list.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) out.push(list[Math.round(i * step)]);
  return Array.from(new Set(out));
}

/**
 * Split the week's volume between the long run and the easy runs.
 *
 * Sizing each session as a fixed share of the weekly total only adds up for
 * someone running five or six days. At three days it delivered about 65% of the
 * target — and since next week's target is computed from what was actually run,
 * the plan spiralled downward while still reporting "+10% this week". An athlete
 * on 30 km/week fell to 14 km in six weeks with nothing on screen looking wrong.
 *
 * So the split is now conservation-first: the quality session keeps its own
 * physiological caps, and whatever volume remains is divided between the long
 * run and the easy runs by weight — the long run counts for 1.8 easy runs. The
 * result is that fewer running days push the long run's share up (which is what
 * every low-frequency plan does in practice) instead of silently shrinking the
 * week.
 *
 * Com uma corrida leve só, porém, "o que sobra" sobrava tudo nela: a semana de
 * 21/09 do Sérgio deu rodagem de 9,5 km e longão de 11,5, um dia depois de um
 * longão de 10,5. A rodagem tinha virado a válvula de escape do volume. Agora
 * ela tem teto — 70% do longão — e o excedente volta como `surplusKm`, para o
 * dia de tiro absorver no aquecimento e no desaquecimento. O total da semana
 * continua fechando; só muda quem carrega o quilômetro.
 */
const EASY_SHARE_OF_LONG = 0.7;
export function distributeWeeklyVolume(
  weeklyKm: number,
  easyDays: number,
  qualityKm: number,
  /** Total running sessions in the week — drives how big the long run may get. */
  runSessions = easyDays + 2,
  /** Longest run completed in the past year, if any. */
  provenLongRunKm = 0,
  /** The athlete's own floors: what they consider a run at all, and a long run. */
  floors: { minRunKm?: number | null; minLongRunKm?: number | null; hasQualityDay?: boolean } = {},
): { longKm: number; easyKm: number; surplusKm: number } {
  const LONG_WEIGHT = 1.8;

  /**
   * The 25–30% guideline assumes five or six running days. Spread the same
   * volume over two or three and the long run legitimately takes a bigger
   * slice — that is what every low-frequency plan does. What must not happen is
   * the long run quietly becoming the entire week.
   */
  const MAX_LONG_SHARE =
    runSessions <= 2 ? 0.60
      : runSessions === 3 ? 0.45
        : runSessions === 4 ? 0.38
          : 0.33;
  const MIN_LONG_SHARE = 0.22;

  const remainder = Math.max(0, weeklyKm - qualityKm);

  // No easy days: the long run absorbs everything that isn't the quality work.
  if (easyDays <= 0) {
    return { longKm: Math.max(5, remainder), easyKm: 0, surplusKm: 0 };
  }

  const unit = remainder / (easyDays + LONG_WEIGHT);
  let longKm = unit * LONG_WEIGHT;

  // Keep the long run inside sane bounds, then give (or take) the difference
  // back to the easy runs so the total still lands on target.
  longKm = Math.min(longKm, weeklyKm * MAX_LONG_SHARE);
  longKm = Math.max(longKm, Math.min(weeklyKm * MIN_LONG_SHARE, remainder));
  longKm = Math.max(5, longKm);

  // Durability the athlete already owns. Bounded by half the week so this lifts
  // the long run without turning the week into a single run — a comeback long
  // run at ~45% of a proven distance is ordinary, 5 km for someone who has run
  // 21 is not.
  const provenFloor = Math.min(provenLongRunKm * 0.45, weeklyKm * 0.5);
  longKm = Math.max(longKm, provenFloor);


  // The athlete's stated long-run floor, honoured only when their own history
  // backs it: asking for 8 km means something different from someone who has
  // run 21 than from someone whose longest ever is 4.
  const askedLong = floors.minLongRunKm ?? 0;
  if (askedLong > 0 && provenLongRunKm >= askedLong) {
    longKm = Math.max(longKm, askedLong);
  }

  // Below the athlete's own floor a run stops being training — 3.5 km for
  // someone with a half marathon in the log is not a cautious prescription, it
  // is a pointless one.
  //
  // The floor yields to the week's total rather than blowing through it: the
  // long run gives up distance first (down to its own floor), and if the week
  // still cannot afford the minimum, the honest answer is short runs, not an
  // overshoot the athlete never agreed to. Weekly volume is the injury-relevant
  // number; session length is the motivation-relevant one.
  const minRun = floors.minRunKm ?? 5;
  // The long run keeps its proven floor even when that squeezes the easy runs:
  // for someone who has covered 21 km, a real long run matters more than a
  // fifth kilometre on an easy day. When the week cannot afford both, short
  // easy runs are the honest outcome — the answer to that is more weekly
  // volume, not a shorter long run.
  const longFloor = Math.max(
    5, provenFloor,
    askedLong > 0 && provenLongRunKm >= askedLong ? askedLong : 0,
  );

  let easyKm = (remainder - longKm) / easyDays;
  if (easyKm < minRun) {
    const needed = (minRun - easyKm) * easyDays;
    const canGive = Math.max(0, longKm - longFloor);
    longKm -= Math.min(needed, canGive);
    easyKm = (remainder - longKm) / easyDays;
  }

  const cappedEasy = round05(Math.max(1, Math.min(easyKm, remainder / easyDays)));

  /*
   * A rodagem não passa de 70% do longão — e o que ela recusa vai para o dia de
   * tiro, não para o ralo. Sem dia de tiro na semana não há quem absorva: aí
   * uma rodagem longa é melhor do que a semana perder quilômetros em silêncio.
   */
  const hasQuality = floors.hasQualityDay ?? qualityKm > 0;
  const roof = round05(round05(longKm) * EASY_SHARE_OF_LONG);
  const finalEasy = hasQuality && cappedEasy > roof && roof >= (floors.minRunKm ?? 5)
    ? roof
    : cappedEasy;

  return {
    longKm: round05(longKm),
    easyKm: finalEasy,
    surplusKm: Math.max(0, Math.round((cappedEasy - finalEasy) * easyDays * 10) / 10),
  };
}

/**
 * Os dias de corrida que o volume da semana consegue pagar.
 *
 * A semana de recuperação de 28/09 do Sérgio tinha 14 km, longão com piso de
 * 8 km e mínimo de 5 km por corrida: sobraram 3 km para cada uma das outras
 * duas. Três corridas de 3 km não são três treinos — e ele tinha configurado
 * 5 km como o que considera uma corrida.
 *
 * Então a semana tira uma corrida em vez de encurtar todas. Cai a do meio
 * primeiro (na ordem leve → tiro → longão, é o tiro), porque recuperação corta
 * intensidade antes de cortar distância, e o longão é o último a sair.
 */
export function runDaysForBudget(
  runDays: WeeklyPlanDay["day"][],
  input: { weeklyKm: number; longFloorKm: number; minRunKm: number; longRunDay?: WeeklyPlanDay["day"] | null },
): WeeklyPlanDay["day"][] {
  const days = [...runDays].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  if (days.length <= 1) return days;

  const longDay = input.longRunDay && days.includes(input.longRunDay) ? input.longRunDay : days[days.length - 1];
  const others = Math.max(0, Math.floor((input.weeklyKm - input.longFloorKm) / Math.max(1, input.minRunKm)));
  const affordable = Math.max(1, Math.min(days.length, others + 1));
  if (affordable >= days.length) return days;

  // Mantém as primeiras da semana e o longão: leve → longão é a forma que sobra.
  const rest = days.filter(d => d !== longDay).slice(0, affordable - 1);
  return days.filter(d => d === longDay || rest.includes(d));
}

/**
 * Assemble the week from the athlete's own layout.
 *
 * Nothing here is fixed to particular weekdays: the athlete says which days they
 * run and lift, and the sessions are distributed over those days following their
 * preferred progression (easy → quality → long).
 */
export function buildWeekPlan(
  ctx: WeekContext,
  sports: string[],
  prefs: TrainingPrefs = DEFAULT_PREFS,
  strengthPrefs?: StrengthPrefs | null,
): WeeklyPlanDay[] {
  const hasStrength = sports.includes("musculacao");
  const hasBike     = sports.includes("ciclismo");
  const hasSwim     = sports.includes("natacao");
  const canRun      = sports.includes("corrida");

  const runDays = canRun ? (prefs.runDays ?? []).filter(d => DAY_ORDER.includes(d)) : [];

  // The strength configuration, when present, owns which days are lifting days
  // — it's the more specific choice (it also says which muscles).
  const configuredStrengthDays = (strengthPrefs?.days ?? []).filter(d => DAY_ORDER.includes(d.day));
  const strengthDays = hasStrength
    ? (configuredStrengthDays.length > 0
        ? configuredStrengthDays.map(d => d.day)
        : (prefs.strengthDays ?? []).filter(d => DAY_ORDER.includes(d)))
    : [];

  /*
   * Numa semana de recuperação, o volume pode não pagar o mínimo do atleta em
   * todas as corridas — 14 km com longão de 8 deixava 3 km para cada uma das
   * outras duas. Aí a semana tira uma corrida em vez de encurtar todas.
   */
  const affordableDays = ctx.isRecovery
    ? runDaysForBudget(runDays, {
      weeklyKm: ctx.weeklyKm,
      longFloorKm: Math.max(5, ctx.minLongRunKm ?? 0),
      minRunKm: ctx.minRunKm ?? 5,
      longRunDay: prefs.longRunDay ?? null,
    })
    : runDays;

  const allocation = allocateRunSessions(affordableDays, {
    longRunDay: prefs.longRunDay ?? null,
    qualityPerWeek: prefs.qualityPerWeek,
    lightDays: prefs.lightDays ?? [],
  });

  // The quality session sets its own size (its caps are physiological), then
  // the rest of the week's volume is divided so the total lands on target.
  let quality = buildIntervalRun(ctx);
  const easyDayCount = Array.from(allocation.values()).filter(k => k === "easy").length;
  // Two quality days means two quality sessions of volume to account for —
  // counting it once let the week overshoot its target by ~30%.
  const qualityDayCount = Array.from(allocation.values()).filter(k => k === "quality").length;
  const { longKm, easyKm, surplusKm } = distributeWeeklyVolume(
    ctx.weeklyKm,
    easyDayCount,
    qualityDayCount * (quality.day.distance_km ?? 0),
    allocation.size,
    ctx.provenLongRunKm ?? 0,
    { minRunKm: ctx.minRunKm, minLongRunKm: ctx.minLongRunKm, hasQualityDay: qualityDayCount > 0 },
  );

  // O que a rodagem recusou vira aquecimento e desaquecimento do dia de tiro.
  if (surplusKm > 0.4 && qualityDayCount > 0) {
    quality = buildIntervalRun(ctx, surplusKm / qualityDayCount);
  }

  const easySession = buildEasyRun(ctx, easyKm);
  const long        = buildLongRun(ctx, longKm);

  const day = (
    d: WeeklyPlanDay["day"],
    base: Partial<WeeklyPlanDay>,
    structure?: StructuredWorkout,
  ): WeeklyPlanDay => ({
    day: d,
    dayPt: DAY_PT[d],
    type: base.type ?? "rest",
    sport: base.sport,
    label: base.label ?? "Descanso",
    distance_km: base.distance_km,
    duration_min: base.duration_min,
    pace: base.pace,
    description: base.description ?? "",
    structure,
    ...(base.quality ? { quality: base.quality } : {}),
  });

  const strength = (focus: string): Partial<WeeklyPlanDay> => ({
    type: "strength",
    sport: "musculacao",
    label: "Musculação",
    duration_min: 60,
    description: `Treino de força — ${focus}. Priorize carga progressiva e execução limpa; força sustenta a corrida e protege de lesão.`,
  });

  const STRENGTH_FOCUS = [
    "membros inferiores, foco em glúteo e posterior",
    "membros superiores e core",
    "membros inferiores leve, sem falha",
    "core e estabilidade",
  ];

  const rest: Partial<WeeklyPlanDay> = {
    type: "rest",
    label: "Descanso",
    description: "Descanso completo. É quando a adaptação acontece — treinar hoje não acelera nada.",
  };

  let strengthIndex = 0;
  // Heavy compounds already used this week, so the next lifting day varies.
  const usedCompounds: string[] = [];

  /** Minimal stand-in for a run day, used by the strength interference guards. */
  const runDayStub = (kind: "easy" | "quality" | "long" | undefined): WeeklyPlanDay | null =>
    kind
      ? ({
          type:  kind === "long" ? "long_run" : kind === "quality" ? "intervals" : "easy",
          label: kind === "long" ? "Longão"   : kind === "quality" ? "Tiro"      : "Rodagem leve",
        } as WeeklyPlanDay)
      : null;

  const buildDay = (d: WeeklyPlanDay["day"]): WeeklyPlanDay => {
    const runKind  = allocation.get(d);
    const dayPlan  = configuredStrengthDays.find(x => x.day === d);
    const liftsToday = strengthDays.includes(d);

    // Build the lifting session first, so it can account for a run on the same
    // day. Running and lifting on one day is normal; dropping one of them
    // because the other exists is not — the athlete asked for both.
    let session = null as ReturnType<typeof buildStrengthSession> | null;
    if (liftsToday && dayPlan && strengthPrefs) {
      const nextKind = allocation.get(DAY_ORDER[(DAY_ORDER.indexOf(d) + 1) % 7]);
      session = buildStrengthSession({
        prefs: strengthPrefs,
        day: dayPlan,
        phase: (ctx.phase ?? "base") as Phase,
        lthr: ctx.lthr,
        nextRunDay: runDayStub(nextKind),
        sameDayRun: runDayStub(runKind),
        usedCompounds,
        block: ctx.weekStart
          ? strengthBlockFor(ctx.weekStart, (ctx.phase ?? "base") as Phase)
          : null,
        runningLoadFactor: ctx.recentAverageKm
          ? runningLoadFactor(ctx.weeklyKm, ctx.recentAverageKm)
          : 1,
      });
      for (const p of session.exercises) {
        if (p.main) usedCompounds.push(p.exerciseId);
      }
    }

    // ── A running day (which may also carry the lifting session) ────────────
    if (runKind) {
      const base = runKind === "easy" ? easySession : runKind === "quality" ? quality : long;
      const runDay = day(d, { ...base.day, sport: "corrida" }, base.structure);

      /*
       * A frase sobre a musculação do dia NÃO é gravada aqui.
       *
       * Ela é derivada da sessão na hora de mostrar (`day-description.ts`).
       * Gravada, ela viajava com a corrida quando a corrida mudava de dia — e
       * a quinta-feira do Sérgio dizia "musculação: peito" treinando perna.
       */
      if (session) {
        return { ...runDay, strength: session };
      }
      if (liftsToday) {
        // Sem split configurado não há o que prometer: o foco é sugestão, e diz isso.
        const focus = STRENGTH_FOCUS[strengthIndex % STRENGTH_FOCUS.length];
        strengthIndex += 1;
        return {
          ...runDay,
          description: `${runDay.description} Depois, musculação — sugestão de foco: ${focus}.`,
        };
      }
      return runDay;
    }

    // ── A lifting-only day ─────────────────────────────────────────────────
    if (liftsToday) {
      if (session) {
        const muscles = dayPlan!.muscles.map(m => MUSCLE_LABEL[m]).join(", ");
        return {
          ...day(d, {
            type: "strength",
            sport: "musculacao",
            label: session.deloaded ? "Musculação (leve)" : "Musculação",
            duration_min: session.estimatedMinutes,
            description: `${muscles}. ${session.exercises.length} exercícios` +
              (session.cardio ? ` + ${session.cardio.minutes} min de ${session.cardio.machine} ${session.cardio.position}` : "") + ".",
          }),
          strength: session,
        };
      }

      const focus = STRENGTH_FOCUS[strengthIndex % STRENGTH_FOCUS.length];
      strengthIndex += 1;
      return day(d, strength(focus));
    }

    // A day the athlete has already given to another sport.
    //
    // Checked before the bike/swim fillers below because it is an explicit
    // choice and those are a guess: someone who wrote "pilates on Wednesday"
    // should not open Wednesday and find the cyclist's default pedal.
    const booked = otherSportsOn(prefs, d);
    if (booked.length > 0) return day(d, crossTrainingDay(booked));

    // Free day: use it for low-impact cross-training when the athlete does it.
    if (hasBike && !runDays.includes(d) && d !== "Sun") {
      return day(d, {
        type: "easy", sport: "ciclismo", label: "Pedal leve", duration_min: 60,
        description: "Pedal regenerativo em Z1-Z2 — volume aeróbico sem impacto.",
      });
    }
    if (hasSwim && !runDays.includes(d) && d !== "Sun") {
      return day(d, {
        type: "easy", sport: "natacao", label: "Natação técnica", duration_min: 45,
        description: "Foco em técnica de braçada e respiração, ritmo leve.",
      });
    }

    return day(d, rest);
  };

  return DAY_ORDER.map(d => {
    const built  = buildDay(d);
    const booked = otherSportsOn(prefs, d);

    // The day already *is* the cross-training session — nothing to announce.
    if (booked.length === 0 || isSecondarySport(built.sport)) return built;

    // Otherwise the run or the lifting session keeps the day and the other
    // sport is stated alongside it. Silently dropping it would be worse: the
    // athlete told us they play volleyball on Thursday, and a plan that shows
    // Thursday as a plain easy run is describing a week that will not happen.
    return {
      ...built,
      description: `${built.description} ${crossTrainingNote(booked)}`.trim(),
    };
  });
}

/** A day whose whole content is one or more tier-2 sports. */
function crossTrainingDay(sports: SecondarySport[]): Partial<WeeklyPlanDay> {
  const labels  = sports.map(s => SPORTS[s].label);
  const minutes = sports.reduce((total, s) => total + sessionMinutes(s), 0);

  return {
    // `easy` rather than a new plan-day type: this is a light session, and the
    // sport field is what distinguishes it. See `isRunSession`.
    type: "easy",
    sport: sports[0],
    label: labels.join(" + "),
    duration_min: minutes,
    description:
      `${joinPt(labels)} — sessão sua, do seu jeito. O treinador não prescreve carga aqui, ` +
      `mas conta o dia como treinado e soma no gasto calórico da semana.`,
  };
}

/** One sentence appending tier-2 sports to a day that already has a session. */
function crossTrainingNote(sports: SecondarySport[]): string {
  return `No mesmo dia: ${joinPt(sports.map(s => SPORTS[s].label))}.`;
}

/** "a", "a e b", "a, b e c" — Portuguese lists take "e", not a trailing comma. */
function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/**
 * Warnings about a layout the athlete chose. The plan still follows their
 * choice — these are advisory, not blocking.
 */
export function reviewPrefs(prefs: TrainingPrefs): string[] {
  const warnings: string[] = [];
  const days = [...(prefs.runDays ?? [])].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  if (days.length === 0) return ["Nenhum dia de corrida selecionado."];

  // Consecutive running days
  const consecutive = days.filter((d, i) =>
    i > 0 && DAY_ORDER.indexOf(d) - DAY_ORDER.indexOf(days[i - 1]) === 1);
  if (consecutive.length > 0) {
    warnings.push(
      "Você corre em dias seguidos — tudo bem, mas mantenha o dia após o treino forte realmente leve.",
    );
  }

  if (days.length >= 6) {
    warnings.push("6+ dias de corrida por semana exige pelo menos um dia bem regenerativo para não acumular fadiga.");
  }

  if (days.length <= 2) {
    warnings.push("Com 2 corridas por semana, o longão e a sessão de qualidade carregam o estímulo — priorize consistência.");
  }

  const qualityRequested = prefs.qualityPerWeek ?? 1;
  if (qualityRequested >= 2 && days.length < 4) {
    warnings.push("2 sessões de qualidade com menos de 4 corridas deixa a semana dura demais; considere 1.");
  }

  return warnings;
}

/**
 * Weekly running volume for the coming week: 4-week average with a capped
 * progression (≤10%/week), and a −30% cutback every fourth week.
 */
export function planWeeklyVolume(
  recentWeeklyKm: number[],       // most recent first
  opts: {
    weekIndex?: number;
    phase?: WeekContext["phase"];
    /**
     * The best four-week average the athlete has actually sustained, over a
     * long window (~12 months).
     *
     * Without it the plan has the memory of a goldfish: someone who raced a
     * half marathon last year and had one quiet month was prescribed 11 km
     * weeks and a 5 km long run, because the only evidence considered was the
     * last four weeks. Fitness lost to a layoff comes back far faster than it
     * was built, so returning to a volume you have already held is not the
     * same risk as reaching it for the first time.
     */
    provenWeeklyKm?: number | null;
    /**
     * Whether a dated race lies ahead.
     *
     * Without one there is nothing to be late for, and the reason to add
     * kilometres quickly disappears with it. The classic 10%-a-week rule is a
     * *ceiling* for athletes building toward something, not a target to hit
     * every week for its own sake — so the patient half of it is the default,
     * and the full rate is reserved for a block with a date at the end.
     */
    raceAhead?: boolean;
  } = {},
): number {
  /*
   * A week below three kilometres is not a training week.
   *
   * One real athlete had 41 recorded "runs" of 270 m, 400 m, 310 m — GPS noise,
   * or a watch started by accident — totalling under a kilometre a week. The
   * engine believed them and prescribed a 1 km week, which serves nobody. Such
   * a week is not evidence of capacity and not evidence of decline either; it
   * is an absence of data, and proven capacity is what should answer instead.
   */
  const recent = recentWeeklyKm.slice(0, 4);
  const trained = recent.filter(v => v >= MIN_TRAINING_WEEK_KM);

  /*
   * But only one empty week is forgiven.
   *
   * One week without running is a cold, a trip, a week the job won — not
   * evidence of anything, and the plan should carry on as if it had not
   * happened. Ignoring *every* empty week, though, lets the one full week speak
   * for the whole month: an athlete who ran twice in four weeks, one of them a
   * 30 km outing, was prescribed a 32 km week, because the engine saw only the
   * week of the 30. From the second empty week on, absence is a pattern, and
   * it counts as what it is — zero.
   *
   * A window with no trained week at all is still treated as missing data
   * below, which is what the GPS-noise athlete needs.
   */
  const emptyWeeks = recent.length - trained.length;
  const valid = trained.length > 0
    ? [...trained, ...Array(Math.max(0, emptyWeeks - 1)).fill(0)]
    : trained;

  /*
   * The base drops the single lightest of the four weeks.
   *
   * Every fourth week is a recovery week by design, at roughly 70% of normal.
   * Averaging it in reads a deliberate cutback as lost capacity and pulls the
   * base down about 7.5% — more than the 5% patient ramp adds back. The result
   * was a plan that *shrank* over six months for an athlete completing every
   * single week: 20 km down to 17. A week that was light on purpose is not
   * evidence of decline, and neither is one week lost to a cold.
   *
   * Real decline still shows: it takes two poor weeks out of four to move the
   * base, and an actual layoff is handled separately by the proven-capacity
   * comeback below.
   */
  const considered = valid.length >= 4
    ? [...valid].sort((a, b) => b - a).slice(0, 3)
    : valid;
  /*
   * With no usable week, fall back to 60% of what the athlete has proven — the
   * same first step back that a returning athlete gets. Twenty kilometres is
   * only right for someone we know nothing about; for someone we know held 20,
   * it is both too much and beneath them.
   */
  const proven0 = opts.provenWeeklyKm ?? 0;
  const base = considered.length > 0
    ? considered.reduce((s, v) => s + v, 0) / considered.length
    : proven0 > 0
      ? Math.max(MIN_TRAINING_WEEK_KM, proven0 * 0.6)
      : 20;                                // nothing known at all

  // Recovery week every 4th, and taper cuts hard.
  if (opts.phase === "taper") return Math.round(base * 0.55);
  if (opts.weekIndex != null && opts.weekIndex > 0 && opts.weekIndex % 4 === 3) {
    return Math.round(base * 0.7);
  }

  const proven = opts.provenWeeklyKm ?? 0;
  const returning = proven > 0 && base < proven * 0.9;

  // Rebuilding towards known ground.
  //
  // "Last week plus 20%" is the wrong model for a comeback: it treats a trained
  // athlete after a quiet month as a beginner, and takes two months to return
  // to volume they held eight weeks ago. Fitness lost to a short layoff comes
  // back in weeks — the first week back lands at a fraction of what was proven,
  // then the ordinary ramp takes over.
  //
  // The `base * 2` bound keeps that honest: someone genuinely down to 3 km a
  // week does not leap to 15 just because they once ran 25.
  if (returning) {
    const comeback = Math.min(proven * 0.6, base * 2);
    /*
     * The comeback is faster than the ordinary ramp — fitness lost to a layoff
     * returns far quicker than it was built — but not equally fast in both
     * cases. With a date to meet, 20% a week toward ground the athlete has
     * already held is a reasonable hurry. Without one there is nothing to be
     * late for, so 10% gets there a few weeks later and asks much less of the
     * tendons, which are the slowest tissue to re-adapt.
     *
     * Either way the result is capped at `proven`: this path returns an athlete
     * to known ground, never past it.
     */
    const climb = opts.raceAhead ? 1.2 : 1.1;
    return Math.round(Math.min(Math.max(base * climb, comeback), proven));
  }

  const ramp = opts.raceAhead ? 1.1 : 1.05;
  return Math.round(Math.min(base * ramp, base + 8));
}

/**
 * Quanto a semana pode crescer sobre a anterior.
 *
 * A trava adota o que foi corrido ("você demonstrou isto") — e sem teto isso
 * subiu a semana do Sérgio de 19 para 24,5 km de uma vez, +29%, puxado por uma
 * troca de treino. A regra dos 10% existe para isso, mas 10% fixo é pouco para
 * quem vem entregando tudo e é demais para quem está no limite. Então o teto
 * varia com o desempenho, nos dois sentidos:
 *
 *   base 10%  +5% se entregou a semana anterior  +5% se são três seguidas
 *             +5% com prova marcada              ≥20% em terreno já sustentado
 *             teto absoluto 25%
 *
 * E o corpo tem voto. Carga aguda acima da faixa segura (ACWR > 1,3) ou forma
 * muito negativa cortam o teto pela metade; risco de lesão (ACWR ≥ 1,5), forma
 * no chão ou um pedido explícito de aliviar zeram — a semana segura onde está,
 * sem encolher.
 */
export function growthCeiling(input: {
  raceAhead?: boolean;
  /** Semanas seguidas entregues (≥100% do plano), contando a última. */
  deliveredStreak?: number;
  /** A melhor média de quatro semanas que este atleta já sustentou. */
  provenWeeklyKm?: number | null;
  /** O volume que a trava quer adotar. */
  targetKm?: number;
  /** Razão aguda:crônica (ATL/CTL) de hoje, quando se sabe. */
  acwr?: number | null;
  /** Forma (TSB) de hoje, quando se sabe. */
  tsb?: number | null;
  /** O atleta pediu sessões mais leves, ou disse que a semana foi demais. */
  easedOff?: boolean;
}): number {
  const acwr = input.acwr ?? null;
  const tsb = input.tsb ?? null;

  // Freio de mão: nada de crescer esta semana.
  if (input.easedOff) return 0;
  if (acwr != null && acwr >= 1.5) return 0;
  if (tsb != null && tsb <= -25) return 0;

  let ceiling = 0.10;
  const streak = input.deliveredStreak ?? 0;
  if (streak >= 1) ceiling += 0.05;
  if (streak >= 3) ceiling += 0.05;
  if (input.raceAhead) ceiling += 0.05;

  // Terreno que este corpo já sustentou volta mais rápido do que foi construído.
  const proven = input.provenWeeklyKm ?? 0;
  const target = input.targetKm ?? 0;
  if (proven > 0 && target > 0 && target <= proven) ceiling = Math.max(ceiling, 0.20);

  ceiling = Math.min(ceiling, 0.25);

  // Meio freio: a carga recente subiu rápido, ou a forma está negativa.
  const straining = (acwr != null && acwr > 1.3) || (tsb != null && tsb <= -15);
  return straining ? ceiling / 2 : ceiling;
}

/**
 * Weekly volume that never slides backwards while the athlete is training.
 *
 * `planWeeklyVolume` reads recent history, so a light week pulls the next week
 * down — defensible in isolation, indefensible as a pattern. Three 16 km weeks
 * followed by a 14 km week reads as the plan giving up, and the athlete is
 * right to call it absurd.
 *
 * So the previous week's *prescription* is a floor, held unless the week was
 * meant to be lighter (deload, taper) or the athlete has genuinely stopped —
 * missing almost everything is real information and the plan should follow it
 * down rather than pile on unrun kilometres.
 */
export function volumeWithRatchet(
  proposedKm: number,
  opts: {
    /** What last week's plan asked for. */
    previousPlannedKm?: number | null;
    /** What the athlete actually ran last week. */
    previousActualKm?: number | null;
    /** Recovery and taper weeks are supposed to go down. */
    lighterByDesign?: boolean;
    /** A dated race ahead earns the faster of the two ramps. */
    raceAhead?: boolean;
    /**
     * Volume already published for this week, when the week has begun.
     *
     * A plan the athlete is already executing is a commitment. Regenerating it
     * downward — which is what a recovery week or a recalculated base will try
     * to do — takes back sessions they may have already built the week around.
     * Growth is fine; shrinking is not.
     */
    alreadyPlannedThisWeekKm?: number | null;
    /**
     * Quanto a semana pode crescer sobre a anterior (fração). Ver `growthCeiling`.
     * Ausente = sem teto, o comportamento antigo.
     */
    growthCeiling?: number | null;
  } = {},
): number {
  // A week already underway keeps at least what it promised.
  const floorForToday = opts.alreadyPlannedThisWeekKm ?? 0;
  const keepPromise = (v: number) => (floorForToday > 0 ? Math.max(v, floorForToday) : v);

  const previous = opts.previousPlannedKm ?? 0;
  if (opts.lighterByDesign || previous <= 0) return keepPromise(proposedKm);

  // Under a third of the plan is not a bad week, it is a stopped athlete.
  const actual = opts.previousActualKm ?? 0;
  if (actual < previous * 0.34) return keepPromise(proposedKm);

  const completion = actual / previous;

  /*
   * Delivering the week earns the next one, however little.
   *
   * Five per cent over what was *run* — the ten-per-cent rule is about load the
   * body absorbed, not load that was written down. An athlete asked for 19 km
   * who ran 22.5 has demonstrated 22.5, and the next week starts from there.
   * Without this, exceeding the plan bought nothing and the extra effort simply
   * evaporated, which is the opposite of the lesson training should teach.
   */
  /*
   * With a race ahead, delivering the week earns five per cent on top of it.
   * Without one, the reward is simply that the plan adopts what was run — which
   * is still a real increase when the athlete exceeded it, and no increase at
   * all when they merely matched it. There is no date to chase, so patience
   * costs nothing and buys durability.
   */
  if (completion >= 1) {
    const earned = opts.raceAhead ? actual * 1.05 : actual;
    /*
     * O teto vive aqui: o atleta demonstrou `actual`, mas adotar tudo de uma
     * vez foi o salto de 29% que o Sérgio viu. O piso continua sendo a semana
     * anterior — entregar o plano nunca faz a próxima encolher.
     */
    const capped = opts.growthCeiling != null
      ? Math.min(earned, previous * (1 + opts.growthCeiling))
      : earned;
    return keepPromise(Math.round(Math.max(proposedKm, Math.min(earned, Math.max(capped, previous)))));
  }

  // Ten per cent short is the week, done. No reason to retreat from it.
  if (completion >= 0.9) return keepPromise(Math.max(proposedKm, previous));

  /*
   * A partially completed week anchors on what was actually run.
   *
   * This is the freeze that held Sérgio's plan at 19.0 km for six consecutive
   * weeks. The floor used to be the previous *planned* volume, so a week
   * completed at 53% still set a 19 km floor; the proposal, computed from real
   * running, came in at 17 and lost to it every time. The floor sustained
   * itself on a plan that was never executed, and nothing could ever move.
   *
   * Protection against one light week dragging the plan down still exists — it
   * lives in `planWeeklyVolume`, which averages four weeks and knows the
   * athlete's proven capacity. That is the right place for it: it looks at
   * evidence rather than at its own previous output.
   */
  return keepPromise(Math.max(proposedKm, Math.round(actual)));
}

/**
 * The best four-week running average in the history given, and the longest
 * single run — the evidence that the athlete has held more volume than the
 * last month suggests.
 */
export function provenCapacity(runs: Array<{ date: string; distance_km: number }>): {
  weeklyKm: number;
  longestRunKm: number;
} {
  if (runs.length === 0) return { weeklyKm: 0, longestRunKm: 0 };

  const byWeek = new Map<string, number>();
  for (const r of runs) {
    const d = new Date(`${r.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const monday = d.toISOString().slice(0, 10);
    byWeek.set(monday, (byWeek.get(monday) ?? 0) + r.distance_km);
  }

  const weeks = Array.from(byWeek.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Rolling four-week average, so one heroic week doesn't set the bar.
  let best = 0;
  for (let i = 0; i + 4 <= weeks.length; i++) {
    const avg = weeks.slice(i, i + 4).reduce((s, [, km]) => s + km, 0) / 4;
    best = Math.max(best, avg);
  }
  // Too little history for a four-week window: fall back to the best week.
  if (best === 0) best = Math.max(...weeks.map(([, km]) => km), 0);

  return {
    weeklyKm: Math.round(best * 10) / 10,
    longestRunKm: Math.round(Math.max(...runs.map(r => r.distance_km)) * 10) / 10,
  };
}

/**
 * True when a plan predates the workout engine.
 *
 * Legacy plans came from free-form AI text: their days carry no `sport`, and
 * their structures (when present) have no per-step intensity — so they can't
 * show km-by-km pace or heart-rate ranges. Lives here (rather than in the
 * server-only plan module) so the UI can check it too.
 */
export function isLegacyPlanShape(plan: { days?: WeeklyPlanDay[] } | null): boolean {
  const days = plan?.days;
  if (!Array.isArray(days) || days.length === 0) return false;

  const training = days.filter(d => d && d.type !== "rest");
  if (training.length === 0) return false;

  const hasSport = training.some(d => !!d.sport);
  const hasIntensity = training.some(d =>
    d.structure?.blocks?.some(b =>
      isRepeatBlock(b) ? b.steps.some(s => !!s.intensity) : !!b.intensity,
    ),
  );

  return !hasSport && !hasIntensity;
}

// ─── Km-by-km expansion ──────────────────────────────────────────────────────

/** Flatten a structure into its ordered steps, expanding repeat blocks. */
export function flattenSteps(structure: StructuredWorkout): WorkoutStep[] {
  const out: WorkoutStep[] = [];
  for (const block of structure.blocks) {
    if (isRepeatBlock(block)) {
      for (let i = 0; i < block.repeat; i++) out.push(...block.steps);
    } else {
      out.push(block);
    }
  }
  return out;
}

/** Mid pace in sec/km from a label like "6:09–7:09/km". */
function parsePaceLabel(label?: string): number | undefined {
  if (!label) return undefined;
  const matches = label.match(/\d+:\d{2}/g);
  if (!matches || matches.length === 0) return undefined;
  const times = matches.map(t => {
    const [m, s] = t.split(":");
    return parseInt(m, 10) * 60 + parseInt(s, 10);
  });
  return Math.round(times.reduce((s, t) => s + t, 0) / times.length);
}

/**
 * Expand a session into a kilometre-by-kilometre table: what pace and which
 * heart-rate window applies to each km.
 *
 * Time-based steps (jog recoveries) are converted to distance using their own
 * prescribed pace, so they occupy the kilometres they actually take — otherwise
 * an interval session would read as several hard kilometres back to back.
 */
export function expandToKmSplits(structure: StructuredWorkout): KmSplit[] {
  const steps = flattenSteps(structure);
  const splits: KmSplit[] = [];

  // Each kilometre collects how much of it belongs to which step; the one with
  // the largest share labels the km, and a km spanning more than one step is
  // flagged so an interval session doesn't read as uniform hard kilometres.
  let carry = 0;
  let kmIndex = 1;
  let contributions: Array<{ step: WorkoutStep; amount: number }> = [];

  const flushKm = (partial: boolean) => {
    if (contributions.length === 0) return;
    const dominant = contributions.reduce((a, b) => (b.amount > a.amount ? b : a));
    const mixed = contributions.filter(c => c.amount > 0.08).length > 1;
    const step = dominant.step;

    const notes: string[] = [];
    if (mixed) {
      const others = contributions
        .filter(c => c.step !== step && c.amount > 0.08)
        .map(c => c.step.kind === "recovery" ? "trote" : c.step.intensity ?? c.step.kind);
      if (others.length) notes.push(`inclui ${Array.from(new Set(others)).join(" + ")}`);
    }
    if (partial) notes.push(`parcial (${carry.toFixed(1)} km)`);
    if (!mixed && !partial && step.note) notes.push(step.note);

    splits.push({
      km:        kmIndex,
      paceLabel: step.pace ?? "—",
      hr:        step.hr,
      kind:      step.kind,
      intensity: step.intensity,
      note:      notes.length ? notes.join(" · ") : undefined,
    });
    kmIndex += 1;
    contributions = [];
  };

  for (const step of steps) {
    let stepKm = step.distance_km ?? 0;
    if (!stepKm && step.duration_min) {
      const mid = parsePaceLabel(step.pace) ?? 390;   // ~6:30/km fallback for jogs
      stepKm = (step.duration_min * 60) / mid;
    }
    if (stepKm <= 0) continue;

    let remaining = stepKm;
    while (remaining > 0) {
      const need = 1 - carry;
      const take = Math.min(need, remaining);
      carry     += take;
      remaining -= take;
      contributions.push({ step, amount: take });

      if (carry >= 0.999) {
        flushKm(false);
        carry = 0;
      }
    }
  }

  // Trailing partial kilometre still worth showing.
  if (carry > 0.15) flushKm(true);

  return splits;
}

/** Total planned distance of a session, including time-based recoveries. */
export function structureDistanceKm(structure: StructuredWorkout): number {
  return flattenSteps(structure).reduce((s, st) => s + (st.distance_km ?? 0), 0);
}
