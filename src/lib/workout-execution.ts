/**
 * Prescribed vs executed, kilometre by kilometre.
 *
 * The app already knew whether a session happened (adherence). It did not know
 * whether the session was *run right* — and that is the whole job of a coach.
 * A 10 km easy run done at threshold pace counts as "completed" and quietly
 * costs a week of recovery; three intervals of 4:02 / 4:06 / 4:44 look like a
 * finished workout and are actually a lesson about starting too fast.
 *
 * Deterministic, like everything else: the verdicts below come from comparing
 * numbers against the prescription. A language model is never asked whether a
 * kilometre was fast.
 */
import { expandToKmSplits } from "@/lib/workout-builder";
import type { KmSplit as ActualSplit } from "@/lib/run-streams";
import type { KmSplit as PrescribedSplit, WeeklyPlanDay, WorkoutStepKind, HrTarget } from "@/types";

export interface PaceRange {
  /** Faster bound, sec/km (the smaller number). */
  fastSec: number;
  /** Slower bound, sec/km. */
  slowSec: number;
}

/**
 * "4:17–4:30/km" → { fastSec: 257, slowSec: 270 }.
 *
 * Accepts en-dash, hyphen or a single value. Returns null for "—" and anything
 * unparsable, so an athlete without a test simply gets no comparison rather
 * than a comparison against nothing.
 */
export function parsePaceRange(label?: string | null): PaceRange | null {
  if (!label) return null;
  const matches = label.match(/(\d{1,3}):(\d{2})/g);
  if (!matches || matches.length === 0) return null;

  const secs = matches.slice(0, 2).map(m => {
    const [min, s] = m.split(":").map(Number);
    return min * 60 + s;
  });

  const fastSec = Math.min(...secs);
  const slowSec = Math.max(...secs);
  if (fastSec <= 0) return null;

  // A single value becomes a ±5 s/km band — nobody holds a pace to the second.
  return secs.length > 1 ? { fastSec, slowSec } : { fastSec: fastSec - 5, slowSec: slowSec + 5 };
}

export type KmVerdict = "dentro" | "rapido" | "lento" | "sem_alvo";

export interface ExecutedKm {
  km: number;
  distanceKm: number;
  actualPaceSec: number;
  actualHr: number | null;
  /** Prescribed target for this kilometre, when the plan had one. */
  target:    PaceRange | null;
  targetHr:  HrTarget | null;
  targetLabel: string | null;
  kind:      WorkoutStepKind | null;
  intensity: string | null;
  verdict:   KmVerdict;
  /** Seconds outside the band: negative = faster, positive = slower, 0 = inside. */
  deltaSec:  number;
}

export type ExecutionSeverity = "boa" | "atencao" | "alerta";

export interface ExecutionFinding {
  key:      string;
  severity: ExecutionSeverity;
  title:    string;
  detail:   string;
}

export interface ExecutionAnalysis {
  kms: ExecutedKm[];
  /** Share of compared kilometres inside the prescribed band (0–1), or null. */
  onTargetPct:  number | null;
  /** How much of the prescribed distance was actually covered (0–1). */
  completionPct: number | null;
  prescribedKm: number;
  actualKm:     number;
  /** Second half pace minus first half, in sec/km. Negative = negative split. */
  splitDeltaSec: number | null;
  findings: ExecutionFinding[];
  /** True when the plan had no pace targets (athlete not calibrated yet). */
  uncalibrated: boolean;
}

/** Tolerance before a kilometre counts as off-target. GPS and terrain wobble. */
const TOLERANCE_SEC = 8;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * How consistently the second half sits on one side of the first half.
 *
 * Rather than trying to classify the session (fartlek? progression?), test
 * whether the conclusion survives looking at every kilometre. A real fade has
 * nearly every second-half kilometre slower than the first-half median; an
 * alternating run has about half on each side and means nothing.
 *
 * Classifying by spread alone was worse: one interrupted kilometre — a traffic
 * light, a hill — looked like a fartlek and suppressed a genuine negative
 * split of 6:07 · 6:06 · 7:02 · 5:37 · 5:17 · 5:38.
 *
 * Returns the share (0–1) of second-half kilometres agreeing with the median
 * difference, or null when there is not enough to judge.
 */
export function splitConsistency(paces: number[]): number | null {
  if (paces.length < 4) return null;

  const mid = Math.floor(paces.length / 2);
  const firstMedian = median(paces.slice(0, mid));
  const second = paces.slice(mid);
  const direction = Math.sign(median(second) - firstMedian);
  if (direction === 0) return null;

  const agreeing = second.filter(p => Math.sign(p - firstMedian) === direction).length;
  return agreeing / second.length;
}

/** Below this the halves disagree too much for the comparison to mean anything. */
const MIN_SPLIT_CONSISTENCY = 0.7;

function verdictFor(actual: number, target: PaceRange | null): { verdict: KmVerdict; deltaSec: number } {
  if (!target) return { verdict: "sem_alvo", deltaSec: 0 };
  if (actual < target.fastSec - TOLERANCE_SEC) return { verdict: "rapido", deltaSec: actual - target.fastSec };
  if (actual > target.slowSec + TOLERANCE_SEC) return { verdict: "lento", deltaSec: actual - target.slowSec };
  return { verdict: "dentro", deltaSec: 0 };
}

/**
 * Align the prescribed session with what was actually run.
 *
 * Both sides are kilometre-indexed, so the alignment is positional. For an
 * interval session a single kilometre can span a rep and part of a recovery —
 * `expandToKmSplits` already flags those, and the findings below lean on the
 * hard kilometres rather than on every row.
 */
export function analyzeExecution(
  planned: WeeklyPlanDay | null,
  actual: ActualSplit[],
): ExecutionAnalysis {
  const prescribed: PrescribedSplit[] = planned?.structure
    ? expandToKmSplits(planned.structure)
    : [];

  const kms: ExecutedKm[] = actual.map((a, i) => {
    const p = prescribed[i] ?? null;
    const target = parsePaceRange(p?.paceLabel);
    const { verdict, deltaSec } = verdictFor(a.paceSecPerKm, target);
    return {
      km: a.km,
      distanceKm: a.distanceKm,
      actualPaceSec: a.paceSecPerKm,
      actualHr: a.avgHr,
      target,
      targetHr: p?.hr ?? null,
      targetLabel: p?.paceLabel && p.paceLabel !== "—" ? p.paceLabel : null,
      kind: p?.kind ?? null,
      intensity: p?.intensity ?? null,
      verdict,
      deltaSec,
    };
  });

  const compared = kms.filter(k => k.target !== null);
  const onTargetPct = compared.length > 0
    ? compared.filter(k => k.verdict === "dentro").length / compared.length
    : null;

  const prescribedKm = planned?.distance_km ?? prescribed.length;
  const actualKm = actual.reduce((s, a) => s + a.distanceKm, 0);
  const completionPct = prescribedKm > 0 ? actualKm / prescribedKm : null;

  // First half vs second half, on full kilometres only.
  //
  // Only meaningful for a continuous run. In an interval session the cool-down
  // sits entirely in the second half, so every well-executed workout would look
  // like it fell apart. Fading reps are caught separately, rep to rep.
  const continuous = planned == null
    || planned.type === "easy" || planned.type === "long_run"
    || planned.type === "recovery" || planned.type === "race";

  const full = actual.filter(a => a.distanceKm >= 0.95);
  const fullPaces = full.map(a => a.paceSecPerKm);

  // Comparing halves of a run that alternates hard and easy reads "second half
  // slower" and blames a fast start — which was wrong on a real unplanned run
  // of 5:22 · 5:21 · 5:19 · 6:08 · 5:10 · 6:33 · 5:14. So the halves are only
  // compared when the kilometres agree with each other.
  const consistency = continuous ? splitConsistency(fullPaces) : null;

  let splitDeltaSec: number | null = null;
  if (consistency != null && consistency >= MIN_SPLIT_CONSISTENCY && full.length >= 4) {
    const mid = Math.floor(full.length / 2);
    const first = median(fullPaces.slice(0, mid));
    const second = median(fullPaces.slice(mid));
    splitDeltaSec = Math.round(second - first);
  }

  return {
    kms,
    onTargetPct,
    completionPct,
    prescribedKm: Math.round(prescribedKm * 10) / 10,
    actualKm: Math.round(actualKm * 10) / 10,
    splitDeltaSec,
    findings: buildFindings({ planned, kms, compared, onTargetPct, completionPct, splitDeltaSec, full }),
    uncalibrated: prescribed.length > 0 && compared.length === 0,
  };
}

function buildFindings(input: {
  planned: WeeklyPlanDay | null;
  kms: ExecutedKm[];
  compared: ExecutedKm[];
  onTargetPct: number | null;
  completionPct: number | null;
  splitDeltaSec: number | null;
  full: ActualSplit[];
}): ExecutionFinding[] {
  const { planned, kms, compared, onTargetPct, completionPct, splitDeltaSec } = input;
  const out: ExecutionFinding[] = [];
  if (kms.length === 0) return out;

  const type = planned?.type;
  const isEasy = type === "easy" || type === "recovery";
  const isLong = type === "long_run";
  const isQuality = type === "intervals" || type === "tempo";

  // ── Started too fast ──────────────────────────────────────────────────────
  // The most common and most expensive mistake in the sport, and invisible
  // from a summary: the average looks right while the run fell apart.
  if (splitDeltaSec != null && splitDeltaSec >= 20 && input.full.length >= 4) {
    out.push({
      key: "saiu_rapido",
      severity: splitDeltaSec >= 40 ? "alerta" : "atencao",
      title: "Você saiu rápido demais",
      detail:
        `A segunda metade veio ${splitDeltaSec}s/km mais lenta que a primeira. ` +
        "Começar conservador e acelerar no fim rende um tempo melhor no mesmo esforço — " +
        "e é o hábito que mais separa quem melhora de quem estaciona.",
    });
  }

  // ── Negative split — worth saying out loud ────────────────────────────────
  if (splitDeltaSec != null && splitDeltaSec <= -8 && input.full.length >= 4) {
    out.push({
      key: "negative_split",
      severity: "boa",
      title: "Negative split",
      detail:
        `Segunda metade ${Math.abs(splitDeltaSec)}s/km mais rápida. ` +
        "É exatamente assim que se corre uma prova bem: chegando forte, não sobrevivendo.",
    });
  }

  // ── The easy run that wasn't easy ─────────────────────────────────────────
  if (isEasy || isLong) {
    const tooFast = compared.filter(k => k.verdict === "rapido");
    if (compared.length >= 3 && tooFast.length / compared.length >= 0.5) {
      const avgOver = Math.round(
        Math.abs(tooFast.reduce((s, k) => s + k.deltaSec, 0) / tooFast.length),
      );
      out.push({
        key: "rodagem_forte",
        severity: "atencao",
        title: isLong ? "Longão acima do ritmo fácil" : "Rodagem leve corrida forte",
        detail:
          `${tooFast.length} de ${compared.length} km vieram cerca de ${avgOver}s/km acima do alvo. ` +
          "O ganho da corrida fácil vem do volume sem custo de recuperação; correndo forte você paga " +
          "o preço de um treino de qualidade sem receber o estímulo de um.",
      });
    }
  }

  // ── Intervals that faded ──────────────────────────────────────────────────
  if (isQuality) {
    const hard = kms.filter(k => k.intensity === "I" || k.intensity === "T" || k.intensity === "R");
    if (hard.length >= 3) {
      const paces = hard.map(k => k.actualPaceSec);
      const spread = Math.max(...paces) - Math.min(...paces);
      const firstHard = paces[0], lastHard = paces[paces.length - 1];

      if (lastHard - firstHard >= 20) {
        out.push({
          key: "tiros_desabaram",
          severity: "atencao",
          title: "Os tiros desandaram no fim",
          detail:
            `Do primeiro ao último, ${lastHard - firstHard}s/km mais lento. ` +
            "O último tiro deveria sair no mesmo ritmo do primeiro — se não sai, o primeiro foi rápido demais, " +
            "não o último que foi fraco.",
        });
      } else if (spread <= 10) {
        out.push({
          key: "tiros_uniformes",
          severity: "boa",
          title: "Tiros uniformes",
          detail: `Variação de apenas ${spread}s/km entre o mais rápido e o mais lento. É exatamente o objetivo da sessão.`,
        });
      }
    }
  }

  // ── Volume actually covered ───────────────────────────────────────────────
  if (completionPct != null && completionPct < 0.85 && (planned?.distance_km ?? 0) > 0) {
    out.push({
      key: "encurtou",
      severity: "atencao",
      title: "Treino mais curto que o previsto",
      detail: `${Math.round(completionPct * 100)}% da distância prescrita. Se foi por cansaço ou dor, vale registrar — ajuda a ajustar a semana.`,
    });
  }
  if (completionPct != null && completionPct > 1.2 && (planned?.distance_km ?? 0) > 0) {
    out.push({
      key: "passou_do_previsto",
      severity: "atencao",
      title: "Bem mais longo que o previsto",
      detail:
        `${Math.round(completionPct * 100)}% da distância prescrita. Volume extra parece inofensivo no dia ` +
        "e aparece três semanas depois — a progressão do plano já conta com o que foi planejado.",
    });
  }

  // ── Heart rate says something the pace doesn't ────────────────────────────
  const withHr = kms.filter(k => k.actualHr != null && k.targetHr);
  if (withHr.length >= 3) {
    const above = withHr.filter(k => k.actualHr! > k.targetHr!.max + 5);
    const onPace = withHr.filter(k => k.verdict === "dentro").length / withHr.length;
    if (above.length / withHr.length >= 0.6 && onPace >= 0.5) {
      out.push({
        key: "fc_alta_no_ritmo",
        severity: "atencao",
        title: "FC alta para o ritmo",
        detail:
          "Você segurou o ritmo, mas a frequência cardíaca ficou acima da faixa na maior parte do treino. " +
          "Costuma ser calor, sono ruim, desidratação ou fadiga acumulada — não perda de forma.",
      });
    }
  }

  // ── Positive feedback when it went well ───────────────────────────────────
  if (onTargetPct != null && onTargetPct >= 0.7 && compared.length >= 3
      && !out.some(f => f.severity !== "boa")) {
    out.push({
      key: "no_alvo",
      severity: "boa",
      title: "Treino no alvo",
      detail: `${Math.round(onTargetPct * 100)}% dos quilômetros dentro da faixa prescrita. Execução exatamente como pedida.`,
    });
  }

  const rank: Record<ExecutionSeverity, number> = { alerta: 0, atencao: 1, boa: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * Recurring execution habits across several sessions.
 *
 * One fast start is a bad day; four in a row is a habit, and a habit is what
 * the advisor should talk about. Runs with no comparison are ignored rather
 * than counted as good.
 */
export function executionPattern(
  analyses: ExecutionAnalysis[],
): { key: string; count: number; total: number } | null {
  const usable = analyses.filter(a => a.onTargetPct != null);
  if (usable.length < 3) return null;

  for (const key of ["saiu_rapido", "rodagem_forte", "tiros_desabaram"]) {
    const count = usable.filter(a => a.findings.some(f => f.key === key)).length;
    if (count >= 3 && count / usable.length >= 0.5) {
      return { key, count, total: usable.length };
    }
  }
  return null;
}
