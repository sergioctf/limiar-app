"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import {
  MapPin, TrendingUp, Zap,
  Target,
  AlertTriangle, Dumbbell, Flame,
  Activity as ActivityIcon, Bike, Waves, PersonStanding, Wind, Plus, Users,
  CalendarCheck, Gauge,
} from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { WeeklyVolumeChart } from "@/components/charts/WeeklyVolumeChart";
import { FitnessCard } from "@/components/dashboard/FitnessCard";
import { AchievementsCard } from "@/components/achievements/AchievementsCard";
import { PersonalRecordsCard } from "@/components/achievements/PersonalRecordsCard";
import { TargetRaceCard } from "@/components/dashboard/TargetRaceCard";
import { CountUp } from "@/components/shared/CountUp";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { AutoStravaSync } from "@/components/dashboard/AutoStravaSync";
import { AutoWellnessSync } from "@/components/dashboard/AutoWellnessSync";
import { CalorieDetailModal } from "@/components/dashboard/CalorieDetailModal";
import { calorieBreakdown } from "@/lib/calorie-breakdown";
import { OvertrainingAlert } from "@/components/dashboard/OvertrainingAlert";
import {
  totalDistanceKm, longestRun, bestPace,
  monthlyVolumeKm,
  secondsToPaceString, formatDate, formatDistanceKm, groupByWeek,
  computeTrainingDays, trainingDaysInWindow, type TrainingDayFilter,
} from "@/lib/utils";
import { computeTrainingLoad, computeRunStreak } from "@/lib/training-load";
import { computeMetrics } from "@/lib/performance";
import { detectAchievements } from "@/lib/achievements";
import { analyzeHistoricalComparison, type EffortLite } from "@/lib/historical-comparison";
import { pickTargetComparison } from "@/lib/target-comparison";
import { detectOvertraining } from "@/lib/overtraining";
import { activityCalories, isStrengthActivity, SPORTS, toSportKey, type SportKey } from "@/lib/sports";
import { WeeklyPlanSummaryCard } from "@/components/dashboard/WeeklyPlanSummaryCard";
import { NotificationNudge } from "@/components/dashboard/NotificationNudge";
import { TestCalibrationCard } from "@/components/dashboard/TestCalibrationCard";
import { localDateStr } from "@/lib/week";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { Card, Section, Row, RowGroup, Reveal } from "@/components/ui/Surface";
import { toneForRatio } from "@/components/ui/tone";
import { Ring } from "@/components/ui/Ring";
import { TodayCard } from "@/components/today/TodayCard";
import { buildToday } from "@/lib/today";
import type { RecoveryToday } from "@/lib/recovery-today";
import type { Run, Goal, SyncLog, Activity, Race, PerformanceTest, WellnessData, WeeklyPlanData } from "@/types";
import { CycleSummaryCard } from "@/components/dashboard/CycleSummaryCard";
import { EntryPrompt } from "@/components/today/EntryPrompt";

interface Props {
  userName?: string | null;
  runs: Run[];
  /**
   * Monday (YYYY-MM-DD) of the athlete's current week, from the server.
   *
   * Passed rather than derived so the runs counted here and the activities
   * fetched there describe the same seven days — and so "this week" cannot
   * change meaning between the top of the page and the bottom.
   */
  weekStartStr: string;
  goals: Goal[];
  lastSync: SyncLog | null;
  weekActivities: Activity[];
  recentActivities: Activity[];
  activitiesHistory: Array<{ date: string; sport_type: string; duration_seconds?: number | null; avg_hr?: number | null }>;
  nextRace?: Race | null;
  latestTest?: PerformanceTest | null;
  wellness?: WellnessData[];
  /** Username, so the setup wizard can pre-fill it. */
  userUsername?: string | null;
  /** Latest recorded body weight — used to estimate missing gym calories. */
  bodyWeightKg?: number | null;
  /** This week's AI plan, shown with a shortcut to the coach. */
  weeklyPlan?: WeeklyPlanData | null;
  /** Today's recovery and the decision it implies — same loader as Saúde. */
  recovery?: RecoveryToday | null;
}

function SportIcon({ type }: { type: string }) {
  const t = type?.toLowerCase() ?? "";
  const cls = "w-4 h-4 shrink-0";
  if (t.includes("run") || t.includes("trail"))                             return <ActivityIcon className={cls} />;
  if (t.includes("weight") || t.includes("workout") || t.includes("crossfit") || t.includes("gym")) return <Dumbbell className={cls} />;
  if (t.includes("ride") || t.includes("bike") || t.includes("cycling"))   return <Bike        className={cls} />;
  if (t.includes("swim"))                                                   return <Waves       className={cls} />;
  if (t.includes("walk") || t.includes("hike"))                            return <PersonStanding className={cls} />;
  if (t.includes("yoga") || t.includes("pilates"))                         return <Wind        className={cls} />;
  return <Zap className={cls} />;
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function todayPtBR(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DashboardContent({
  userName,
  runs,
  weekStartStr,
  goals,
  lastSync,
  weekActivities,
  recentActivities,
  activitiesHistory,
  nextRace,
  latestTest,
  wellness = [],
  userUsername = null,
  bodyWeightKg = null,
  weeklyPlan = null,
  recovery = null,
}: Props) {
  const firstName  = userName?.trim().split(" ")[0] || null;
  const totalDist  = totalDistanceKm(runs);
  const longest    = longestRun(runs);
  const best       = bestPace(runs);
  const monthly    = monthlyVolumeKm(runs);
  const lastRun    = runs[0] ?? null;
  const weeklyData = groupByWeek(runs).slice(-12);

  // Training load (CTL/ATL/TSB) — uses LTHR + threshold pace if test available
  const testMetrics = latestTest
    ? computeMetrics(latestTest.distance_km * 1000, latestTest.time_seconds, latestTest.avg_hr ?? undefined, latestTest.max_hr ?? undefined)
    : null;
  const lthr = testMetrics?.lthr ?? null;
  const thresholdPace = testMetrics?.paces.find(p => p.name === "threshold")?.pace_min_sec ?? null;
  // Same activities as the readiness score reads, so "forma" is one number everywhere.
  const fitnessData = computeTrainingLoad(runs, lthr, thresholdPace, 90, activitiesHistory);

  // Days trained in a rolling month, across every sport. A streak punished the
  // rest days the rest of the app keeps prescribing.
  const last30 = trainingDaysInWindow(runs, activitiesHistory, 30);

  // Average pace over the last 7 days (more actionable than an all-time average)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = localDateStr(sevenDaysAgo);
  const lastWeekRuns = runs.filter((r) => r.date >= sevenDaysAgoStr);
  const lastWeekDist = lastWeekRuns.reduce((s, r) => s + r.distance_km, 0);
  const lastWeekDur  = lastWeekRuns.reduce((s, r) => s + r.duration_seconds, 0);
  const weekAvgPace  = lastWeekDist > 0 ? Math.round(lastWeekDur / lastWeekDist) : null;

  // (goals prop kept for compat but not displayed on dashboard — managed via /goals page)

  // Training readiness: % of 4-week volume trend (last week vs best of prior 3)
  const last4Weeks = groupByWeek(runs).slice(-4);
  const lastWeekKm = last4Weeks[last4Weeks.length - 1]?.totalKm ?? 0;
  const prior3Max  = Math.max(...last4Weeks.slice(0, 3).map((w) => w.totalKm), 1);
  const readinessPct = Math.min(100, Math.round((lastWeekKm / prior3Max) * 100));

  // This week's runs. The Monday comes from the server, which used the same
  // value to fetch `weekActivities` — deriving it again here is how the runs
  // and the gym sessions ended up counted over two different weeks.
  const weekRuns = runs.filter((r) => r.date >= weekStartStr);
  const weekRunKm = weekRuns.reduce((s, r) => s + r.distance_km, 0);

  // This week gym stats (strength bucket — includes HIIT)
  const weekGymCount = weekActivities.filter((a) => isStrengthActivity(a.sport_type)).length;
  const weekGymMinutes = weekActivities.reduce((s, a) => s + (a.duration_seconds ?? 0) / 60, 0);

  // Total calories this week (runs + activities). Gym/bike/swim sessions often
  // have no recorded calories — estimate those from duration so they still count.
  const weekRunCalories = weekRuns.reduce((s, r) => s + (r.calories ?? 0), 0);
  const weekGymCalories = weekActivities.reduce(
    (s, a) => s + activityCalories(a, bodyWeightKg), 0,
  );
  const weekCalories    = Math.round(weekRunCalories + weekGymCalories);
  const calorieDay      = calorieBreakdown(weekRuns, weekActivities, bodyWeightKg);

  // Total training hours this week
  const weekRunSeconds  = weekRuns.reduce((s, r) => s + r.duration_seconds, 0);
  const weekGymSeconds  = weekActivities.reduce((s, a) => s + (a.duration_seconds ?? 0), 0);
  const weekTotalHours  = (weekRunSeconds + weekGymSeconds) / 3600;

  // Activity feed: merge recent runs (last 30 days) with recentActivities
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyAgoStr = localDateStr(thirtyAgo);
  const recentRuns = runs.filter((r) => r.date >= thirtyAgoStr).slice(0, 6);

  type FeedItem =
    | { kind: "run"; id: string; name: string; date: string; sport_type: string; metric: string }
    | { kind: "gym"; id: string; name: string; date: string; sport_type: string; metric: string };

  const feedItems: FeedItem[] = [
    ...recentRuns.map((r) => ({
      kind: "run" as const,
      id: r.id,
      name: r.name,
      date: r.date,
      sport_type: r.type === "easy" ? "Run" : r.type,
      metric: formatDistanceKm(r.distance_km),
    })),
    ...recentActivities.map((a) => ({
      kind: "gym" as const,
      id: a.id,
      name: a.name,
      date: a.date,
      sport_type: a.sport_type,
      metric: a.duration_seconds
        ? `${Math.floor(a.duration_seconds / 3600) > 0 ? Math.floor(a.duration_seconds / 3600) + "h" : ""}${Math.floor((a.duration_seconds % 3600) / 60)}min`
        : "—",
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  // Training days filter state
  const [dayFilter, setDayFilter] = useState<TrainingDayFilter>("all");
  const [calorieDetail, setCalorieDetail] = useState(false);

  // Training days comparison: this week vs 3-week avg vs 3-month avg
  const trainingDays = useMemo(
    () => computeTrainingDays(runs, activitiesHistory, dayFilter),
    [runs, activitiesHistory, dayFilter]
  );

  // Training balance (last 30 days)
  const balance30RunCount   = recentRuns.length;
  const balance30GymCount   = recentActivities.filter((a) => {
    const t = a.sport_type?.toLowerCase() ?? "";
    return t.includes("weight") || t.includes("workout") || t.includes("crossfit");
  }).length;
  const balance30OtherCount = recentActivities.length - balance30GymCount;

  // Achievements and historical comparison
  /*
   * The stream-derived best efforts, so the dashboard's records are the same
   * numbers the coach's records card shows. Without them this card could only
   * see whole activities and reported Sérgio's 5 km as 5:57/km when he had
   * covered 5 km at 5:19/km inside a long run.
   *
   * Fetched rather than passed down because it is a slow-changing, non-blocking
   * extra: the card renders immediately from whole activities and sharpens when
   * the efforts land.
   */
  const [efforts, setEfforts] = useState<EffortLite[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setEfforts((d?.efforts ?? []) as EffortLite[]); })
      .catch(() => {/* the whole-activity fallback still stands */});
    return () => { cancelled = true; };
  }, []);

  const historicalRecords = useMemo(
    () => analyzeHistoricalComparison(runs, efforts),
    [runs, efforts],
  );

  // Badges read the same records the card above them shows.
  const achievements = useMemo(() => detectAchievements(runs, efforts), [runs, efforts]);

  // Target race comparison (current fitness vs goal target)
  const targetComparison = useMemo(
    () => pickTargetComparison(goals, latestTest ?? null),
    [goals, latestTest]
  );

  // Overtraining risk assessment (TSB + ACWR + streak + volume jump)
  const overtraining = useMemo(
    () => detectOvertraining(runs, lthr, thresholdPace, wellness),
    [runs, lthr, thresholdPace, wellness]
  );

  // New user with no data at all yet — show a guided welcome instead of zeroed-out cards
  const isNewUser = runs.length === 0 && recentActivities.length === 0;


  /*
   * Today's answer, computed from the plan the athlete actually has.
   *
   * The screen opens with this and nothing else at full size. Everything below
   * is a summary that opens on demand — the trade that lets the app stay full
   * of features without shouting all of them at once.
   */
  const today = useMemo(() => buildToday({
    plan: weeklyPlan ?? null,
    runs: runs.map(r => ({ date: r.date, distance_km: r.distance_km })),
    today: localDateStr(new Date()),
    weekStart: weekStartStr,
    hasTest: !!latestTest,
    why: {
      weeklyKm: (weeklyPlan?.days ?? []).reduce((sum, d) => sum + (d.distance_km ?? 0), 0),
    },
  }), [weeklyPlan, runs, weekStartStr, latestTest]);

  const hojeCarga = Array.isArray(fitnessData) && fitnessData.length > 0
    ? fitnessData[fitnessData.length - 1]
    : null;

  /* Last month of fitness, for the trend beside the numbers. */
  const ctlTrend = Array.isArray(fitnessData)
    ? fitnessData.slice(-30).map(d => d.ctl)
    : [];

  /*
   * How much of last week's plan was completed, for the ghost arc.
   *
   * Compared against the same target, because comparing a ratio to a ratio
   * computed from a different denominator would be a chart that lies.
   */
  const lastWeekRatio = useMemo(() => {
    const start = new Date(`${weekStartStr}T12:00:00`);
    start.setDate(start.getDate() - 7);
    const from = localDateStr(start);
    const km = runs
      .filter(r => r.date >= from && r.date < weekStartStr)
      .reduce((sum, r) => sum + r.distance_km, 0);
    const planned = (weeklyPlan?.days ?? []).reduce((sum, d) => sum + (d.distance_km ?? 0), 0);
    return planned > 0 && km > 0 ? km / planned : null;
  }, [runs, weekStartStr, weeklyPlan]);

  /*
   * The sports actually trained this week.
   *
   * The card used to read "corridas · muscu · kcal" for everybody, so an
   * athlete who swam and cycled was shown a week made of two things they
   * may not have done. Running is pinned first because the plan is built
   * around it; the others follow by volume, and only two fit beside it.
   */
  const weekSports = useMemo(() => {
    const counts = new Map<SportKey, number>();
    for (const a of weekActivities) {
      const k = toSportKey(a.sport_type);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    counts.delete("corrida");

    const others = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1)
      .map(([key, count]) => ({
        key,
        count,
        label: SPORTS[key].label,
        href: "/calendar",
      }));

    return [
      { key: "corrida" as SportKey, count: weekRuns.length, label: "Corridas", href: "/runs" },
      ...others,
    ];
  }, [weekActivities, weekRuns.length]);

  const weekPlannedKm = (weeklyPlan?.days ?? [])
    .reduce((s, d) => s + (d.distance_km ?? 0), 0);

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-6 animate-scale-in">
      <OnboardingGate isNewUser={isNewUser} />
      <AutoStravaSync />
      <AutoWellnessSync />
      {calorieDetail && (
        <CalorieDetailModal day={calorieDay} label="Esta semana"
                            onClose={() => setCalorieDetail(false)} />
      )}

      <SetupChecklist name={userName} username={userUsername} />

      {/* Header — deliberately quiet. The greeting is not the information. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {/*
            The greeting is the first thing on the screen and it was set in the
            same size as a caption. It does not need to shout, but it does need
            to look like the start of something.
          */}
          <p className="text-xl font-bold text-surface-100">
            {greetingByHour()}{firstName ? ", " + firstName : ""}
          </p>
          <p className="text-xs text-surface-500 mt-0.5 first-letter:uppercase">{todayPtBR()}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/friends" className="btn-secondary" aria-label="Amigos">
            <Users className="w-4 h-4" />
          </Link>
          <Link href="/runs/new" className="btn-primary" aria-label="Registrar treino">
            <Plus className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* ── The answer ──────────────────────────────────────────────────── */}
      {/* The coach asks as a pop-up on entry, never as a card parked above the day. */}
      <EntryPrompt refreshKey={runs.map(r => r.id).join(",")} />
      <TodayCard today={today} recovery={recovery} />

      {/*
        Only the alert that costs the athlete something if ignored stays above
        the fold. A blocked-notifications notice is worth saying once, quietly,
        not worth outshouting the session of the day in amber.
      */}
      {!isNewUser && <OvertrainingAlert assessment={overtraining} />}

      {/*
        Everything visible, ordered by weight.

        Two passes went wrong here in opposite directions: the first hid the
        whole screen behind accordions, the second replaced them with links and
        left a home page made of buttons. Both misread the reference — Whoop's
        overview is *dense*: a ring, bars and charts, all on screen at once.
        What it does not do is give them equal weight.

        So nothing is hidden. The hierarchy is size: the session of the day is
        enormous, the week is a ring, the trends are charts, and the reference
        material is small. Depth still exists — one tap into a dedicated screen
        — but nobody should have to open anything to feel that the app knows
        what it is talking about.
      */}
      <Reveal className="space-y-5">

        <Section
          title="Esta semana"
          action={<Link href="/coach" className="text-xs text-surface-500 hover:text-surface-300">Plano</Link>}
        >
          <Card>
            {/*
              The ring is the centrepiece, so it sits in the centre.

              It was pinned to the left with the numbers crowded beside it, which
              made the one element the eye should land on look like an ornament
              attached to a list.
            */}
            <div className="flex flex-col items-center gap-4">
              <Ring
                ratio={weekPlannedKm > 0 ? weekRunKm / weekPlannedKm : 0}
                ghost={weekPlannedKm > 0 ? lastWeekRatio : null}
                tone={toneForRatio(weekPlannedKm > 0 ? weekRunKm / weekPlannedKm : null)}
                label="do plano"
                size={132}
                thickness={13}
              >
                {weekPlannedKm > 0 ? Math.round((weekRunKm / weekPlannedKm) * 100) + "%" : "—"}
              </Ring>

              <div className="text-center">
                <p className="text-3xl font-black text-surface-100 tabular-nums leading-none">
                  <CountUp value={Math.round(weekRunKm * 10) / 10} />
                  <span className="text-base text-surface-500 font-bold ml-1">km</span>
                </p>
                <p className="text-xs text-surface-500 mt-1">
                  {weekPlannedKm > 0 ? `de ${weekPlannedKm} km planejados` : "corrida nesta semana"}
                  {lastWeekRatio != null && weekPlannedKm > 0 && (
                    <span className="text-surface-600"> · semana passada {Math.round(lastWeekRatio * 100)}%</span>
                  )}
                </p>
              </div>

              {/*
                Every sport the athlete actually trained this week, not the two
                the dashboard happened to hardcode. Somebody who swims and rides
                was being told their week consisted of running and weights.

                Running leads because the plan is built around it; the rest
                follow in the order they were done.
              */}
              <div className="w-full grid grid-cols-3 gap-1.5">
                {weekSports.map(sp => (
                  <Link
                    key={sp.key}
                    href={sp.href}
                    className="rounded-xl bg-surface-700/30 hover:bg-surface-700/60 active:scale-95 transition-all py-3 min-h-[56px] flex flex-col items-center justify-center"
                  >
                    <span className="text-lg font-bold text-surface-100 tabular-nums leading-none">
                      <CountUp value={sp.count} />
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-surface-500 mt-0.5 text-center px-1 leading-tight">
                      {sp.label}
                    </span>
                  </Link>
                ))}

                <button
                  onClick={() => setCalorieDetail(true)}
                  className="rounded-xl bg-surface-700/30 hover:bg-surface-700/60 active:scale-95 transition-all py-3 min-h-[56px] flex flex-col items-center justify-center"
                >
                  <span className="text-lg font-bold text-surface-100 tabular-nums leading-none">
                    <CountUp value={Math.round(weekCalories)} />
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-surface-500 mt-0.5">kcal</span>
                </button>
              </div>
            </div>
          </Card>
        </Section>

        {weeklyPlan && <WeeklyPlanSummaryCard plan={weeklyPlan} />}

        {/*
          The real load card, not a summary of it.

          I had replaced this with three numbers and a sparkline, which is
          less than what already existed: FitnessCard carries the CTL/ATL
          curve and the TSB band, and those charts are the most visual thing
          on the screen. Trading a chart for a digit is not simplification.
        */}
        <Section
          title="Carga de treino"
          action={<Link href="/analytics" className="text-xs text-surface-500 hover:text-surface-300">Detalhes</Link>}
        >
          <FitnessCard data={fitnessData} />
        </Section>

        {/* Where this block sits in the four-week cycle. */}
        <CycleSummaryCard
          runs={runs}
          tests={latestTest ? [latestTest] : []}
          activities={activitiesHistory}
        />

        {/* Calibration only speaks when it has something to say — it returns
            null while the test is current, which is why wrapping it in a
            drawer produced one that opened onto nothing. */}
        <TestCalibrationCard tests={latestTest ?? null} />
        {/* The charts come back. A dashboard without them is a menu. */}
        <Section
          title="Volume"
          subtitle="Últimas 12 semanas"
          action={<Link href="/analytics" className="text-xs text-surface-500 hover:text-surface-300">Gráficos</Link>}
        >
          <Card>
            <WeeklyVolumeChart data={weeklyData} />
          </Card>
        </Section>

        <PersonalRecordsCard records={historicalRecords} />

        <AchievementsCard achievements={achievements} />

        {targetComparison && <TargetRaceCard comparison={targetComparison} />}

        <Section
          title="Atividade recente"
          action={<Link href="/runs" className="text-xs text-surface-500 hover:text-surface-300">Ver todas</Link>}
        >
          <Card density="tight">
            {feedItems.length === 0 ? (
              <p className="text-sm text-surface-500 text-center py-4">Nada registrado ainda.</p>
            ) : (
              <RowGroup>
                {feedItems.slice(0, 6).map((item) => (
                  <Row
                    key={item.kind + item.id}
                    href={item.kind === "run" ? "/runs/" + item.id : "/calendar"}
                    icon={<SportIcon type={item.sport_type} />}
                    label={item.name}
                    detail={new Date(item.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    value={item.metric}
                  />
                ))}
              </RowGroup>
            )}
          </Card>
        </Section>

        <Section title="Seus números">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total de corridas" value={runs.length} icon={Target} />
            <StatCard label="Distância total" value={formatDistanceKm(totalDistanceKm(runs))} icon={MapPin} />
            <StatCard label="Sequência" value={computeRunStreak(runs) + " dias"} icon={Flame} />
            {/*
              `trainingDaysInWindow` returns { count, days } where `days` is the
              size of the window, not the days trained — so this card proudly
              reported 30 out of 30 for everybody, forever.
            */}
            <StatCard label="Dias treinados (30d)" value={last30.count} icon={CalendarCheck} />
          </div>
        </Section>

        <NotificationNudge />
      </Reveal>

      {lastSync && (
        <p className="text-center text-[11px] text-surface-600">
          Strava sincronizado em {new Date(lastSync.created_at).toLocaleDateString("pt-BR")}
        </p>
      )}
    </div>
  );
}
