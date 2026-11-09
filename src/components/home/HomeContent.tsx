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
import { sessionTone } from "@/lib/session-colors";
import { formatMinutes, type WeekMovement } from "@/lib/week-movement";
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

export function HomeContent({
  dateLabel, today, recovery, healthConnected = true, week, tomorrow, attention, refreshKey,
  firstName, userName, username, isNewUser, needsOnboarding, overtraining, calorieDay, lastSyncAt, history,
}: {
  dateLabel: string;
  today: Today;
  recovery: RecoveryToday | null;
  /** Há relógio conectado: sem isso a Home não fala de disposição nem de cansaço. */
  healthConnected?: boolean;
  week: WeekMovement;
  tomorrow: WeeklyPlanDay | null;
  attention: HomeAttention | null;
  refreshKey: string;
  firstName: string | null;
  userName: string | null;
  username: string | null;
  isNewUser: boolean;
  needsOnboarding: boolean;
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
  const mainPending = today.state === "planned" && !!status && !status.sessions[0]?.done && !status.sessions[0]?.unresolved;
  const runPending = mainPending && today.session != null && (today.session.sport ?? "corrida") === "corrida"
    && today.session.type !== "strength";
  const doneActivity = status?.done.find(d => d.planned && d.id) ?? status?.done.find(d => d.id);
  const swapped = today.session?.swap ?? null;
  /*
   * The overload alert takes the attention slot first — when there is load in it.
   * Sleep, HRV and resting heart rate alone are the body's signals, already in
   * the recovery ring and in the coach's question before a hard session; a red
   * "sinais de sobrecarga" with form at +1 said the same thing louder and wrong.
   */
  const overtrained = !!overtraining && overtraining.level !== "ok"
    && overtraining.signals.some(s => LOAD_SIGNALS.has(s.id));

  const tiles = week.bySport;
  const maxDayMinutes = Math.max(1, ...week.days.map(d => d.done.reduce((sum, item) => sum + item.minutes, 0)));

  /*
   * The block about the body only exists when it has something to say: a score,
   * a question before the session, an invitation to check in, or an offer to
   * swap. An empty "Como você está hoje" card says nothing and costs a screen.
   */
  const healthBlock = mainPending
    || (healthConnected && recovery != null && (recovery.score != null || recovery.needsCheckin || recovery.offer != null));

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
      <OnboardingGate needsSetup={needsOnboarding} />
      {!needsOnboarding && <AutoStravaSync />}
      <AutoWellnessSync />
      {calorieDetail && calorieDay && (
        <CalorieDetailModal day={calorieDay} label="Esta semana" onClose={() => setCalorieDetail(false)} />
      )}

      {/* Quiet header: the greeting is not the information. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 suppressHydrationWarning className="text-[clamp(1.65rem,7vw,2.25rem)] font-semibold leading-tight tracking-tight text-surface-100">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="text-xs text-surface-500 mt-0.5 first-letter:uppercase">{dateLabel}</p>
          {/* Quem vai correr decide roupa e hora por isto (Sérgio, 20/09). */}
          <div className="mt-1.5"><WeatherNow /></div>
        </div>
        <Link href="/runs/new" className="btn-secondary shrink-0" aria-label="Registrar treino">
          <Plus className="w-4 h-4" />
        </Link>
      </div>

      {!needsOnboarding && <EntryPrompt refreshKey={refreshKey} />}

      {/* ── 1. Treino de hoje ─────────────────────────────────────────────── */}
      <Section title="Treino de hoje">
        <div className="limiar-feature p-4 sm:p-6">
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
                <p className="text-2xl font-semibold text-surface-100">{doneActivity ? "Atividade registrada" : "Sem plano para hoje"}</p>
                {!doneActivity && <Link href="/coach" className="btn-primary w-full">Gerar plano da semana <ArrowRight className="w-4 h-4" /></Link>}
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
                      {s.done ? <><Check className="w-3 h-3" /> feito</> : s.unresolved ? "a confirmar" : "previsto"}
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
                <Link href="/coach" className="btn-primary w-full">{status?.sessions.some(s => s.unresolved) ? "Vincular atividade" : "Ver treino"} <ArrowRight className="w-4 h-4" /></Link>
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
                    <span>{d.recordName || d.label}</span>
                    <span className="text-surface-500">· {d.km != null ? `${num(d.km)} km · ` : ""}{formatMinutes(d.minutes)}{d.kcal ? ` · ${d.kcal} kcal` : ""}{d.planned ? "" : status.sessions.some(s => s.unresolved && s.sport === d.sport) ? " · vínculo a confirmar" : " · fora do plano"}</span>
                  </p>
                ))}
                {today.state !== "planned" && doneActivity?.id && (
                  <Link href={doneActivity.kind === "run" ? `/runs/${doneActivity.id}` : `/activities/${doneActivity.id}`} className="btn-primary mt-2 w-full">
                    Ver atividade <ArrowRight className="w-4 h-4" />
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
        </div>
      </Section>

      {/*
        ── 2. Como você está hoje ──────────────────────────────────────────

        Depois do treino, não antes (Sérgio, 01/10). Quem abre o app de manhã
        quer saber o que vai fazer; como o corpo está é a segunda pergunta — e
        é uma pergunta sobre o treino, não sobre si mesma.
      */}
      {healthBlock && (
        <Section title="Como você está hoje">
          <Card>
            <div className="space-y-3">
              {healthConnected && recovery && recovery.score != null && (
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

              {healthConnected && recovery?.needsCheckin && today.state !== "done" && (
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

      <Section
        title="Movimento na semana"
        action={<Link href="/runs" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-brand-400">Histórico <ArrowRight className="h-4 w-4" /></Link>}
      >
        <Card>
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold tracking-tight tabular-nums text-surface-100">{week.sessions} {week.sessions === 1 ? "atividade" : "atividades"}</p>
                <p className="text-sm text-surface-400">{week.minutes > 0 ? formatMinutes(week.minutes) + " em movimento" : "Seus registros aparecem aqui."}</p>
              </div>
              <Link href="/coach" className="btn-ghost shrink-0 !px-2 text-brand-400">Ver plano</Link>
            </div>

            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Movimento por dia">
              {week.days.map((d, i) => {
                const minutes = d.done.reduce((sum, item) => sum + item.minutes, 0);
                return (
                  <button key={d.date} type="button" aria-pressed={i === selected}
                    aria-label={`${d.short}, ${d.done.length} ${d.done.length === 1 ? "atividade registrada" : "atividades registradas"}`}
                    onClick={() => setSelected(i)}
                    className={`flex min-w-0 min-h-[84px] flex-col items-center justify-end gap-2 rounded-xl px-1 py-2 transition-colors ${i === selected ? "bg-brand-500/10 text-brand-400" : "text-surface-500 hover:bg-surface-700/40"}`}>
                    <span className="flex h-11 w-4 max-w-full items-end overflow-hidden rounded-full bg-surface-700/70" aria-hidden>
                      {d.done.length > 0 && <span className="limiar-movement-fill w-full rounded-full" style={{ height: `${Math.max(10, minutes / maxDayMinutes * 100)}%` }} />}
                    </span>
                    <span className="text-[10px] font-bold">{d.short}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1 rounded-xl bg-surface-900/45 px-3 py-2" aria-live="polite">
              {day.done.length === 0 && <p className="text-sm text-surface-500">Nenhuma atividade registrada neste dia.</p>}
              {day.done.map((x, i) => (
                <div key={x.id ?? i} className="flex items-center gap-2 min-h-[44px] text-sm text-surface-200">
                  <SportGlyph sport={x.sport} className="w-4 h-4 shrink-0 text-brand-400" />
                  <span className="min-w-0 flex-1">{x.label}<span className="block text-xs text-surface-500">{x.km != null ? `${num(x.km)} km · ` : ""}{formatMinutes(x.minutes)}</span></span>
                  {x.id && <Link aria-label={`Ver ${x.label}`} href={x.kind === "run" ? `/runs/${x.id}` : `/activities/${x.id}`} className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center text-brand-400"><ArrowRight className="w-4 h-4" /></Link>}
                </div>
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

      <NotificationNudge />
      {!needsOnboarding && <SetupChecklist name={userName} username={username} />}

      {/* O histórico — números da vida toda, recordes, conquistas — só existe
          depois de existir histórico. */}
      {!isNewUser && history && (
        <details className="card px-4">
          <summary className="flex min-h-[48px] cursor-pointer items-center text-sm font-medium text-surface-200">Seu progresso e recordes</summary>
          <div className="pb-4">{history}</div>
        </details>
      )}

      {lastSyncAt && (
        <p className="text-center text-[11px] text-surface-600">
          Strava sincronizado em {new Date(lastSyncAt).toLocaleDateString("pt-BR")}
        </p>
      )}
    </div>
  );
}
