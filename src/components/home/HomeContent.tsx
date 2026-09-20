"use client";

/**
 * Hoje — the Home (approved by Sérgio on 18/09, replacing the dashboard).
 *
 * Hierarchy (Sérgio, 20/09): what needs my attention → how I am today → what I
 * train today → my week. The alerts come first, because a warning at the foot
 * of a scrolling page is a warning nobody reads, and how the body is comes
 * before the session because it is what decides how the session goes.
 * One main action. The recovery is its own block, as a 0–100 ring. The
 * week counts every sport, shows what was planned and did not happen as well
 * as what did, and carries its numbers big (Sérgio, 18/09: "deixar mais visual
 * e grande os big numbers").
 *
 * No fim da página, depois de tudo: o teste de 3 km, seus números, os recordes
 * e a prova-alvo — voltaram de Gráficos em 20/09, mas no rodapé, porque falam
 * da vida inteira e não do dia. Carga e forma ficam em Saúde, o ciclo no
 * Treinador, e Gráficos voltou a ser só gráfico.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Card, Section } from "@/components/ui/Surface";
import { Ring } from "@/components/ui/Ring";
import type { Tone } from "@/components/ui/tone";
import { CountUp } from "@/components/shared/CountUp";
import { SportGlyph } from "@/components/shared/SportGlyph";
import { WeatherNow } from "@/components/home/WeatherNow";
import { TodayCheckPanel } from "@/components/today/TodayCheck";
import { AdaptSessionControl } from "@/components/today/AdaptSession";
import { SwapActions } from "@/components/today/SwapActions";
import { EntryPrompt } from "@/components/today/EntryPrompt";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { AutoStravaSync } from "@/components/dashboard/AutoStravaSync";
import { AutoWellnessSync } from "@/components/dashboard/AutoWellnessSync";
import { OvertrainingAlert } from "@/components/dashboard/OvertrainingAlert";
import { NotificationNudge } from "@/components/dashboard/NotificationNudge";
import { CalorieDetailModal } from "@/components/dashboard/CalorieDetailModal";
import { SPORTS } from "@/lib/sports";
import { sessionTone } from "@/lib/session-colors";
import { formatMinutes, type MovementDay, type WeekMovement } from "@/lib/week-movement";
import type { RecoveryToday } from "@/lib/recovery-today";
import type { CalorieDay } from "@/lib/calorie-breakdown";
import type { OvertrainingAssessment } from "@/lib/overtraining";
import type { Today } from "@/lib/today";
import type { WeeklyPlanDay } from "@/types";

const num = (n: number) => Number(n.toFixed(1)).toString().replace(".", ",");
const VERDICT_TONE: Record<string, Tone> = { alta: "good", moderada: "warn", baixa: "alert" };
/** Overload signals that come from training itself (see overtraining.ts). */
const LOAD_SIGNALS = new Set(["tsb", "acwr", "streak", "volume"]);

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export interface HomeAttention { text: string; href: string; action: string }

/** One circle per session: filled when done, outlined when still to come, dashed when it did not happen. */
function DayMarks({ day }: { day: MovementDay }) {
  const marks = [
    ...day.done.map(x => ({ sport: x.sport, state: "done" as const })),
    ...day.missed.map(x => ({ sport: x.sport, state: "missed" as const })),
    ...day.upcoming.map(x => ({ sport: x.sport, state: "upcoming" as const })),
  ];
  if (marks.length === 0) return <span className="w-7 h-7 flex items-center justify-center text-surface-700">·</span>;
  return (
    <>
      {marks.map((m, i) => (
        <span
          key={i}
          className={`w-7 h-7 rounded-full flex items-center justify-center ${
            m.state === "done" ? "bg-brand-500/15 text-brand-400"
              : m.state === "missed" ? "border border-dashed border-amber-500/60 text-amber-400/80"
                : "border border-surface-600 text-surface-500"
          }`}
        >
          <SportGlyph sport={m.sport} className="w-3.5 h-3.5" />
        </span>
      ))}
    </>
  );
}

export function HomeContent({
  dateLabel, today, recovery, week, tomorrow, attention, refreshKey,
  firstName, userName, username, isNewUser, overtraining, calorieDay, lastSyncAt, history,
}: {
  dateLabel: string;
  today: Today;
  recovery: RecoveryToday | null;
  week: WeekMovement;
  tomorrow: WeeklyPlanDay | null;
  attention: HomeAttention | null;
  refreshKey: string;
  firstName: string | null;
  userName: string | null;
  username: string | null;
  isNewUser: boolean;
  overtraining: OvertrainingAssessment | null;
  /** The week's workouts, measured and estimated, for "Calorias" on tap. */
  calorieDay: CalorieDay | null;
  lastSyncAt: string | null;
  /**
   * O fundo da página: teste de 3 km, seus números, recordes e prova-alvo.
   *
   * Vieram de Gráficos em 20/09, a pedido do Sérgio, e ficam aqui embaixo de
   * propósito — falam da vida inteira, não do dia, e em cima disputariam com a
   * sessão de hoje.
   */
  history?: React.ReactNode;
}) {
  const todayIndex = Math.max(0, week.days.findIndex(d => d.isToday));
  const [selected, setSelected] = useState(todayIndex);
  const [calorieDetail, setCalorieDetail] = useState(false);
  const day = week.days[selected];
  const status = today.status;
  const mainPending = today.state === "planned" && !!status && !status.sessions[0]?.done;
  const runPending = mainPending && today.session != null && (today.session.sport ?? "corrida") === "corrida"
    && today.session.type !== "strength";
  const doneRun = status?.done.find(d => d.kind === "run" && d.id);
  const swapped = today.session?.swap ?? null;
  /*
   * The overload alert takes the attention slot first — when there is load in it.
   * Sleep, HRV and resting heart rate alone are the body's signals, already in
   * the recovery ring and in the coach's question before a hard session; a red
   * "sinais de sobrecarga" with form at +1 said the same thing louder and wrong.
   */
  const overtrained = !!overtraining && overtraining.level !== "ok"
    && overtraining.signals.some(s => LOAD_SIGNALS.has(s.id));

  /*
   * The tiles are whatever the week actually has.
   *
   * They used to be running and lifting, hardcoded, plus anything else that was
   * done — which showed a swimmer a "Corrida 0" every Monday and an athlete who
   * only lifts a sport they never practise. Now: every sport with a session
   * registered, plus every sport the plan asked for this week even when none of
   * it has happened yet, so a planned sport shows its zero and an unplanned one
   * does not exist.
   */
  const tiles = [...week.bySport];
  for (const d of week.days) {
    for (const p of [...d.upcoming, ...d.missed]) {
      if (!p.sport || tiles.some(t => t.sport === p.sport)) continue;
      const meta = SPORTS[p.sport];
      tiles.push({
        sport: p.sport, label: meta?.label ?? p.label, emoji: meta?.emoji ?? "",
        sessions: 0, minutes: 0, km: meta?.unit === "distance" ? 0 : null,
      });
    }
  }

  /*
   * The block about the body only exists when it has something to say: a score,
   * a question before the session, an invitation to check in, or an offer to
   * swap. An empty "Como você está hoje" card says nothing and costs a screen.
   */
  const healthBlock = mainPending
    || (recovery != null && (recovery.score != null || recovery.needsCheckin || recovery.offer != null));

  const offer = (
    <>
      {recovery?.offer && !recovery.offer.undo && (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-surface-400">{recovery.advice.detail}</p>
          <SwapActions offer={recovery.offer} />
        </div>
      )}
      {recovery?.offer?.undo && <SwapActions offer={recovery.offer} compact />}
    </>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-6 animate-fade-in">
      <OnboardingGate isNewUser={isNewUser} />
      <AutoStravaSync />
      <AutoWellnessSync />
      <SetupChecklist name={userName} username={username} />
      {calorieDetail && calorieDay && (
        <CalorieDetailModal day={calorieDay} label="Esta semana" onClose={() => setCalorieDetail(false)} />
      )}

      {/* Quiet header: the greeting is not the information. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-bold text-surface-100">{greeting()}{firstName ? `, ${firstName}` : ""}</p>
          <p className="text-xs text-surface-500 mt-0.5 first-letter:uppercase">{dateLabel}</p>
          {/* Quem vai correr decide roupa e hora por isto (Sérgio, 20/09). */}
          <div className="mt-1.5"><WeatherNow /></div>
        </div>
        <Link href="/runs/new" className="btn-secondary shrink-0" aria-label="Registrar treino">
          <Plus className="w-4 h-4" />
        </Link>
      </div>

      {/* ── What deserves attention, before anything else ─────────────────── */}
      <NotificationNudge />
      {overtrained ? (
        <Section title="Merece atenção">
          <OvertrainingAlert assessment={overtraining!} />
        </Section>
      ) : attention && (
        <Section title="Merece atenção">
          <Link href={attention.href} className="flex items-center justify-between gap-3 rounded-2xl border border-surface-700 px-4 py-3 min-h-[56px] hover:border-surface-600">
            <span className="text-sm text-surface-200">{attention.text}</span>
            <span className="shrink-0 inline-flex items-center gap-1 text-sm text-brand-400">{attention.action} <ArrowRight className="w-4 h-4" /></span>
          </Link>
        </Section>
      )}

      <EntryPrompt refreshKey={refreshKey} />

      {/* ── 1. Como você está hoje ────────────────────────────────────────── */}
      {healthBlock && (
        <Section title="Como você está hoje">
          <Card>
            <div className="space-y-3">
              {recovery && recovery.score != null && (
                <Link
                  href="/health"
                  className="flex items-center gap-3 rounded-2xl border border-surface-700 bg-surface-900/40 p-3 transition-colors hover:border-surface-600 active:scale-[0.99]"
                >
                  <Ring ratio={recovery.score / 100} size={64} thickness={6} tone={VERDICT_TONE[recovery.verdict ?? "moderada"]}>
                    <span className="text-base font-bold">{recovery.score}</span>
                  </Ring>
                  {/*
                    * A frase é o assunto; "Disposição" é só o rótulo dela.
                    *
                    * Antes o destaque era a palavra "Recuperação", seguida de
                    * "Relógio + carga" — a procedência do número, que interessa
                    * a quem desconfia dele, não a quem vai treinar em dez
                    * minutos. Quem quiser a conta abre Saúde, que é onde ela
                    * mora (Sérgio, 20/09).
                    */}
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold leading-snug text-surface-100">{recovery.short}</span>
                    <span className="block text-xs text-surface-500">Disposição</span>
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0 text-surface-600" />
                </Link>
              )}

              {/* The question before a demanding session, and the swap it can lead to. */}
              {mainPending ? <TodayCheckPanel>{offer}</TodayCheckPanel> : offer}

              {recovery?.needsCheckin && today.state !== "done" && (
                <Link
                  href="/health?checkin=1"
                  className="flex min-h-[44px] items-center justify-between rounded-xl bg-surface-700/30 px-3 text-sm text-surface-300 hover:text-surface-100"
                >
                  <span>Como você dormiu? Check-in de 20 s afina a recuperação</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Link>
              )}
            </div>
          </Card>
        </Section>
      )}

      {/* ── 2. Treino de hoje ─────────────────────────────────────────────── */}
      <Section title="Treino de hoje">
        <Card density="roomy">
          <div className="space-y-4">
            {swapped && (
              <p className="text-xs font-medium text-surface-500">
                Trocado hoje · era {swapped.original.label}
                {swapped.original.distance_km ? ` ${num(swapped.original.distance_km)} km` : ""}
              </p>
            )}
            {today.session?.movedFrom && (
              <p className="text-xs font-medium text-surface-500">Vindo de {today.session.movedFrom.toLowerCase()}</p>
            )}

            {today.state === "no_plan" ? (
              <div className="space-y-3">
                <p className="text-2xl font-black text-surface-100">Sem plano para hoje</p>
                <Link href="/coach" className="btn-primary w-full">Gerar plano da semana <ArrowRight className="w-4 h-4" /></Link>
              </div>
            ) : today.state === "rest" ? (
              <div>
                <p className="text-3xl font-black text-surface-100">Descanso</p>
                <p className="text-sm text-surface-400 mt-1">É quando a adaptação acontece.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {(status?.sessions ?? []).map((s, i) => {
                  /*
                   * A cor é a do tipo do treino, a mesma do Treinador: rodagem
                   * verde, limiar amarelo, tiro vermelho, longão roxo (Sérgio,
                   * 20/09 — "vamos continuar usando esses color codes"). Só
                   * aqui: em "Minha semana" a cor já quer dizer feito, previsto
                   * ou não feito, e duas gramáticas no mesmo bloco se anulam.
                   */
                  const tone = sessionTone(s.type);
                  return (
                  <li key={`${s.sport}-${i}`} className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={`shrink-0 rounded-xl flex items-center justify-center border ${i === 0 ? "w-11 h-11" : "w-9 h-9"} ${tone.bg} ${tone.border} ${tone.text}`}>
                        <SportGlyph sport={s.sport} className={i === 0 ? "w-5 h-5" : "w-4 h-4"} />
                      </span>
                      <div className="min-w-0">
                        <p className={`${i === 0 ? "text-2xl font-black" : "text-base font-semibold"} text-surface-100 leading-tight`}>{s.label}</p>
                        <p className="text-sm text-surface-400 mt-0.5">
                          <span className={`text-xs font-semibold uppercase tracking-wide ${tone.text}`}>{tone.label}</span>
                          {s.detail ? ` · ${s.detail}` : ""}
                          {i === 0 && today.session?.pace ? ` · ${today.session.pace}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.done ? "bg-green-500/15 text-green-300" : "bg-surface-700/60 text-surface-400"
                    }`}>
                      {s.done ? <><Check className="w-3 h-3" /> feito</> : "previsto"}
                    </span>
                  </li>
                  );
                })}
              </ul>
            )}

            {today.why && today.state === "planned" && (
              <p className="text-xs text-surface-500 pl-3 border-l-2 border-surface-700 leading-relaxed">{today.why}</p>
            )}

            {/* One main action; adapting is the second one. */}
            {today.state === "planned" && (
              <div className="space-y-2">
                <Link href="/coach" className="btn-primary w-full">Ver treino <ArrowRight className="w-4 h-4" /></Link>
                {runPending && today.session && <AdaptSessionControl day={today.session} />}
              </div>
            )}

            {/* After the session: what was done, and its feedback. */}
            {status && status.done.length > 0 && (
              <div className="space-y-1.5 border-t border-surface-700/60 pt-3">
                <p className="text-[11px] uppercase tracking-wider text-surface-500">Realizado</p>
                {status.done.map((d, i) => (
                  <p key={`${d.label}-${i}`} className="flex items-center gap-2 text-sm text-surface-200">
                    <SportGlyph sport={d.sport} className="w-3.5 h-3.5 text-brand-400" />
                    <span>{d.label}</span>
                    <span className="text-surface-500">· {d.km != null ? `${num(d.km)} km · ` : ""}{formatMinutes(d.minutes)}{d.kcal ? ` · ${d.kcal} kcal` : ""}{d.planned ? "" : " · fora do plano"}</span>
                  </p>
                ))}
                {doneRun?.id && (
                  <Link href={`/runs/${doneRun.id}`} className="inline-flex items-center gap-1 min-h-[44px] text-sm text-brand-400">
                    Ver corrida e feedback <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            )}

            {tomorrow && tomorrow.type !== "rest" && (today.state !== "planned" || status?.allDone) && (
              <p className="text-xs text-surface-500">
                Amanhã: <span className="text-surface-300">{tomorrow.label}{tomorrow.distance_km ? ` · ${num(tomorrow.distance_km)} km` : ""}</span>
              </p>
            )}

            {/* The calibration nudge sits under the session, never over it. */}
            {today.prompt?.kind === "test" && (
              <Link href={today.prompt.href} className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 min-h-[44px]">
                <span className="text-sm text-amber-200/90 leading-snug">{today.prompt.text}</span>
                <ArrowRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              </Link>
            )}
          </div>
        </Card>
      </Section>

      {/* ── 3. Minha semana — every sport, done and not done, numbers big ── */}
      <Section
        title="Minha semana"
        action={<Link href="/runs" className="text-xs text-surface-500 hover:text-surface-300">Histórico</Link>}
      >
        <Card>
          <div className="space-y-5">
            {/*
             * Um número, no meio (Sérgio, 20/09).
             *
             * Havia três formas de dizer a mesma semana aqui: o anel de
             * sessões, os dias treinados e uma frase que repetia os dois. Três
             * números lado a lado não são três informações — são um leitor
             * decidindo em qual acreditar. Ficou o anel; o tempo vira legenda,
             * porque é a única coisa que ele não diz.
             */}
            <div className="flex flex-col items-center gap-2 py-1">
              <Ring
                ratio={week.plannedSessions > 0 ? week.sessions / week.plannedSessions : week.sessions > 0 ? 1 : 0}
                size={132}
                thickness={12}
                tone="brand"
                label="sessões"
              >
                <span className="text-3xl font-black tabular-nums">{week.sessions}<span className="text-surface-500 text-lg font-bold">/{week.plannedSessions || week.sessions}</span></span>
              </Ring>
              {week.minutes > 0 && (
                <p className="text-xs text-surface-500">{formatMinutes(week.minutes)} em atividade</p>
              )}
            </div>

            {/* The week, day by day: done, planned, and planned but not done. */}
            <div>
              <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Dias da semana">
                {week.days.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    role="tab"
                    aria-selected={i === selected}
                    onClick={() => setSelected(i)}
                    className={`min-h-[76px] rounded-xl flex flex-col items-center justify-start gap-1 pt-1.5 pb-1 transition-colors ${
                      i === selected ? "bg-surface-700/70" : "hover:bg-surface-700/40"
                    }`}
                  >
                    <span className={`text-[10px] uppercase ${d.isToday ? "text-brand-400 font-bold" : "text-surface-500"}`}>{d.short}</span>
                    <span className="flex flex-col items-center gap-1"><DayMarks day={d} /></span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-[10px] text-surface-500">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-500/40" /> feito</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-surface-500" /> previsto</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-dashed border-amber-500/70" /> não feito</span>
              </div>
            </div>

            {/* The selected day, right below — no second list to scroll to. */}
            <div className="rounded-xl bg-surface-800/50 px-3 py-2 space-y-1.5 min-h-[44px]">
              {day.done.length === 0 && day.upcoming.length === 0 && day.missed.length === 0 && (
                <p className="text-xs text-surface-500">{day.isFuture ? "Nada previsto." : "Nenhuma atividade registrada."}</p>
              )}
              {day.done.map((x, k) => (
                <p key={`dd${k}`} className="flex items-center gap-2 text-sm text-surface-200">
                  <SportGlyph sport={x.sport} className="w-3.5 h-3.5 text-brand-400" />
                  <span>{x.label}</span>
                  <span className="text-surface-500">· {x.km != null ? `${num(x.km)} km · ` : ""}{formatMinutes(x.minutes)}{x.planned ? "" : " · fora do plano"}</span>
                  {x.kind === "run" && x.id && <Link href={`/runs/${x.id}`} className="ml-auto text-xs text-brand-400">ver</Link>}
                </p>
              ))}
              {day.missed.map((x, k) => (
                <p key={`mm${k}`} className="flex items-center gap-2 text-sm text-surface-400">
                  <SportGlyph sport={x.sport} className="w-3.5 h-3.5 text-amber-400/80" />
                  <span>{x.label}{x.detail ? ` · ${x.detail}` : ""}</span>
                  <span className="text-[11px] text-amber-400/80">não feito</span>
                </p>
              ))}
              {day.upcoming.map((x, k) => (
                <p key={`uu${k}`} className="flex items-center gap-2 text-sm text-surface-500">
                  <SportGlyph sport={x.sport} className="w-3.5 h-3.5" />
                  <span>{x.label}{x.detail ? ` · ${x.detail}` : ""}</span>
                  <span className="text-[11px]">previsto</span>
                </p>
              ))}
            </div>

            {/* Every sport, big; calories beside them. */}
            <div className="grid grid-cols-3 gap-2">
              {tiles.map(t => (
                <Link
                  key={t.label}
                  href={t.sport === "corrida" ? "/runs" : `/runs?sport=${t.sport ?? ""}`}
                  className="rounded-2xl bg-surface-700/30 hover:bg-surface-700/60 active:scale-95 transition-all p-3 min-h-[92px] flex flex-col justify-between"
                >
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-500">
                    <SportGlyph sport={t.sport} className="w-3.5 h-3.5" /> {t.label}
                  </span>
                  <span>
                    <span className="block text-2xl font-black text-surface-100 tabular-nums leading-none"><CountUp value={t.sessions} /></span>
                    <span className="block text-[11px] text-surface-500 mt-1">
                      {t.km != null && t.km > 0 ? `${num(t.km)} km` : t.minutes > 0 ? formatMinutes(t.minutes) : t.sessions === 1 ? "sessão" : "sessões"}
                    </span>
                  </span>
                </Link>
              ))}
              {week.calories && (
                <button
                  type="button"
                  onClick={() => setCalorieDetail(true)}
                  disabled={!calorieDay}
                  className="rounded-2xl bg-surface-700/30 hover:bg-surface-700/60 active:scale-95 transition-all p-3 min-h-[92px] flex flex-col justify-between text-left"
                >
                  <span className="text-[10px] uppercase tracking-wider text-surface-500">Calorias</span>
                  <span>
                    <span className="block text-2xl font-black text-surface-100 tabular-nums leading-none"><CountUp value={week.calories.kcal} /></span>
                    <span className="block text-[11px] text-surface-500 mt-1">
                      {week.calories.source === "relogio" ? "kcal · relógio" : week.calories.source === "misto" ? "kcal · relógio + treinos" : "kcal · treinos"}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </Card>
      </Section>

      {history}

      {lastSyncAt && (
        <p className="text-center text-[11px] text-surface-600">
          Strava sincronizado em {new Date(lastSyncAt).toLocaleDateString("pt-BR")}
        </p>
      )}
    </div>
  );
}
