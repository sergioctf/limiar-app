/**
 * Post-race analysis — compares the prediction against what actually happened,
 * reads the pacing pattern, and stores a debrief the athlete can act on.
 *
 * The hard numbers (deltas, implied VDOT, split drift) are computed here, not
 * by the model; the AI only writes the narrative around them.
 */
import { localDateStr } from "@/lib/week";
import { generateRaceAnalysis } from "@/lib/ai";
import { computeMetrics } from "@/lib/performance";
import { secondsToPaceString, secondsToReadable } from "@/lib/utils";
import type { Race, Run } from "@/types";

type DbClient = ReturnType<typeof import("@/lib/supabase/server").createAdminClient>;

export interface RaceAnalysisNumbers {
  actualSeconds:    number;
  predictedSeconds: number | null;
  deltaSeconds:     number | null;   // negative = faster than predicted
  targetSeconds:    number | null;
  vdotBefore:       number | null;
  vdotFromRace:     number | null;
  avgPaceSeconds:   number;
  /** Positive = second half slower than first (faded). */
  splitDriftSeconds: number | null;
  firstHalfPace:    number | null;
  secondHalfPace:   number | null;
}

export interface RaceAnalysisResult {
  ok: boolean;
  error?: string;
  numbers?: RaceAnalysisNumbers;
  reportId?: string | null;
}

/** Per-km splits from a run's cached streams, when available. */
async function loadSplits(db: DbClient, runId: string): Promise<number[] | null> {
  try {
    const { data } = await db
      .from("run_streams").select("streams")
      .eq("run_id", runId).maybeSingle();

    // streams is a JSONB blob: { time: [...], distance: [...], heartrate: [...] }
    const s = data?.streams as { time?: number[]; distance?: number[] } | undefined;
    const dist = s?.distance;
    const time = s?.time;
    if (!Array.isArray(dist) || !Array.isArray(time) || dist.length !== time.length) return null;

    // Time at each completed kilometre → per-km durations.
    const splits: number[] = [];
    let nextKm = 1000;
    let prevTime = 0;
    for (let i = 0; i < dist.length; i++) {
      while (dist[i] >= nextKm) {
        splits.push(time[i] - prevTime);
        prevTime = time[i];
        nextKm += 1000;
      }
    }
    return splits.length >= 2 ? splits : null;
  } catch {
    return null;
  }
}

/**
 * Build and persist the debrief for a finished race.
 * Stored as a coach_report so it shows up in Treinador → Relatórios.
 */
export async function analyzeRace(
  db: DbClient,
  userId: string,
  race: Race,
): Promise<RaceAnalysisResult> {
  if (!race.time_seconds || race.time_seconds <= 0) {
    return { ok: false, error: "Prova ainda sem tempo registrado." };
  }

  const actualSeconds = race.time_seconds;
  const avgPaceSeconds = Math.round(actualSeconds / race.distance_km);

  // ── Fitness as it stood BEFORE the race ───────────────────────────────────
  let vdotBefore: number | null = null;
  let predictedSeconds: number | null = null;
  try {
    const { data: tests } = await db
      .from("performance_tests").select("distance_km, time_seconds, avg_hr, test_date")
      .eq("user_id", userId).lt("test_date", race.race_date)
      .order("test_date", { ascending: false }).limit(1);
    const t = tests?.[0];
    if (t) {
      const m = computeMetrics(t.distance_km * 1000, t.time_seconds, t.avg_hr ?? undefined);
      vdotBefore = m.vdot;
      const closest = m.predictions.reduce((best, p) =>
        Math.abs(p.distance_km - race.distance_km) < Math.abs(best.distance_km - race.distance_km) ? p : best,
      );
      // Only trust the prediction if it's for a comparable distance.
      if (Math.abs(closest.distance_km - race.distance_km) <= race.distance_km * 0.2) {
        predictedSeconds = closest.predicted_seconds;
      }
    }
  } catch { /* no tests yet */ }

  // VDOT implied by the race itself
  let vdotFromRace: number | null = null;
  try {
    vdotFromRace = computeMetrics(race.distance_km * 1000, actualSeconds, race.avg_hr ?? undefined).vdot;
  } catch { /* ignore */ }

  // Target time from a matching goal, if any
  let targetSeconds: number | null = null;
  try {
    const { data: goals } = await db
      .from("goals").select("target_time_seconds, race_date, distance_km")
      .eq("user_id", userId).eq("race_date", race.race_date).limit(1);
    targetSeconds = (goals?.[0]?.target_time_seconds as number | null) ?? null;
  } catch { /* goals optional */ }

  // ── Pacing: find the run recorded for this race ───────────────────────────
  let splitSummary = "Sem dados de ritmo por quilômetro.";
  let splitDriftSeconds: number | null = null;
  let firstHalfPace: number | null = null;
  let secondHalfPace: number | null = null;

  try {
    const { data: runs } = await db
      .from("runs").select("id, date, distance_km, duration_seconds")
      .eq("user_id", userId).eq("date", race.race_date).is("deleted_at", null);

    const match = ((runs ?? []) as Run[])
      .find(r => Math.abs(r.distance_km - race.distance_km) <= Math.max(0.6, race.distance_km * 0.05));

    if (match) {
      const splits = await loadSplits(db, match.id);
      if (splits && splits.length >= 2) {
        const half = Math.floor(splits.length / 2);
        const avg = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
        firstHalfPace  = avg(splits.slice(0, half));
        secondHalfPace = avg(splits.slice(half));
        splitDriftSeconds = secondHalfPace - firstHalfPace;

        splitSummary = splits
          .map((s, i) => `km ${i + 1}: ${secondsToPaceString(s)}`)
          .join(" · ");
        splitSummary += `\nPrimeira metade ${secondsToPaceString(firstHalfPace)}/km · segunda metade ${secondsToPaceString(secondHalfPace)}/km` +
          ` (${splitDriftSeconds > 0 ? "+" : ""}${splitDriftSeconds}s/km)`;
      }
    }
  } catch { /* streams optional */ }

  // ── Build-up: volume over the 8 weeks before the race ─────────────────────
  let trainingSummary = "Sem histórico de treino registrado.";
  try {
    const from = new Date(`${race.race_date}T12:00:00`);
    from.setDate(from.getDate() - 56);
    const { data: buildRuns } = await db
      .from("runs").select("date, distance_km, duration_seconds")
      .eq("user_id", userId).is("deleted_at", null)
      .gte("date", localDateStr(from)).lt("date", race.race_date);

    const list = (buildRuns ?? []) as Run[];
    if (list.length > 0) {
      const totalKm = list.reduce((s, r) => s + r.distance_km, 0);
      const longest = Math.max(...list.map(r => r.distance_km));
      trainingSummary =
        `${list.length} corridas em 8 semanas · ${totalKm.toFixed(0)} km totais ` +
        `(~${(totalKm / 8).toFixed(0)} km/semana) · longão máximo ${longest.toFixed(1)} km`;
    }
  } catch { /* ignore */ }

  const numbers: RaceAnalysisNumbers = {
    actualSeconds,
    predictedSeconds,
    deltaSeconds: predictedSeconds !== null ? actualSeconds - predictedSeconds : null,
    targetSeconds,
    vdotBefore,
    vdotFromRace,
    avgPaceSeconds,
    splitDriftSeconds,
    firstHalfPace,
    secondHalfPace,
  };

  // ── Narrative ─────────────────────────────────────────────────────────────
  const analysis = await generateRaceAnalysis({
    raceName: race.name,
    distanceKm: race.distance_km,
    raceDate: race.race_date,
    actualSeconds,
    predictedSeconds,
    targetSeconds,
    vdotBefore,
    vdotFromRace,
    avgHr: race.avg_hr,
    splitSummary,
    trainingSummary,
  });

  if (!analysis) return { ok: false, error: "Não foi possível gerar a análise agora.", numbers };

  // ── Persist as a coach report (period_type 'run' = single effort) ─────────
  const payload = {
    user_id:      userId,
    title:        `Análise da prova — ${race.name}`,
    report_date:  localDateStr(),
    period_type:  "run",
    period_start: race.race_date,
    period_end:   race.race_date,
    summary:      analysis.summary,
    strengths:    analysis.whatWorked,
    weaknesses:   analysis.whatToImprove,
    recommendations: analysis.nextCycleFocus,
    full_report:  [
      `Tempo: ${secondsToReadable(actualSeconds)} (${secondsToPaceString(avgPaceSeconds)}/km)`,
      predictedSeconds !== null
        ? `Previsto: ${secondsToReadable(predictedSeconds)} — diferença de ${numbers.deltaSeconds! > 0 ? "+" : ""}${numbers.deltaSeconds}s`
        : "Sem previsão (nenhum teste antes da prova).",
      targetSeconds ? `Alvo: ${secondsToReadable(targetSeconds)}` : "",
      vdotFromRace ? `VDOT implicado pela prova: ${vdotFromRace.toFixed(1)}${vdotBefore ? ` (antes: ${vdotBefore.toFixed(1)})` : ""}` : "",
      splitDriftSeconds !== null
        ? `Deriva de ritmo: ${splitDriftSeconds > 0 ? "+" : ""}${splitDriftSeconds}s/km na segunda metade`
        : "",
      "",
      splitSummary,
    ].filter(Boolean).join("\n"),
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from("coach_reports").select("id")
    .eq("user_id", userId).eq("period_type", "run").eq("period_start", race.race_date)
    .ilike("title", "Análise da prova%").limit(1);

  let reportId: string | null = existing?.[0]?.id ?? null;
  if (reportId) {
    await db.from("coach_reports").update(payload).eq("id", reportId);
  } else {
    const { data: created } = await db.from("coach_reports").insert(payload).select("id").single();
    reportId = created?.id ?? null;
  }

  return { ok: true, numbers, reportId };
}
