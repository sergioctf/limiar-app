"use client";

/**
 * The new Home — a prototype living beside the current one until Sérgio approves.
 *
 * Hierarchy agreed on 18/09: what I do today → what I did this week → what
 * deserves attention. One main action. The recovery is context inside the
 * session, not a second card. The week counts every sport and never turns into
 * a productivity score.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Flame, HeartPulse } from "lucide-react";
import { Card, Section } from "@/components/ui/Surface";
import { TodayCheckPanel } from "@/components/today/TodayCheck";
import { AdaptSessionControl } from "@/components/today/AdaptSession";
import { SwapActions } from "@/components/today/SwapActions";
import { EntryPrompt } from "@/components/today/EntryPrompt";
import { SPORTS } from "@/lib/sports";
import { formatMinutes, type WeekMovement } from "@/lib/week-movement";
import type { Today } from "@/lib/today";
import type { RecoveryToday } from "@/lib/recovery-today";
import type { WeeklyPlanDay } from "@/types";

const num = (n: number) => Number(n.toFixed(1)).toString().replace(".", ",");
const emojiOf = (sport: string | null) => (sport && sport in SPORTS ? SPORTS[sport as keyof typeof SPORTS].emoji : "•");

export interface HomeAttention { text: string; href: string; action: string }

export function HomePreview({
  dateLabel, today, recovery, week, tomorrow, attention, refreshKey,
}: {
  dateLabel: string;
  today: Today;
  recovery: RecoveryToday | null;
  week: WeekMovement;
  tomorrow: WeeklyPlanDay | null;
  attention: HomeAttention | null;
  refreshKey: string;
}) {
  const todayIndex = Math.max(0, week.days.findIndex(d => d.isToday));
  const [selected, setSelected] = useState(todayIndex);
  const day = week.days[selected];
  const status = today.status;
  const mainPending = today.state === "planned" && !!status && !status.sessions[0]?.done;
  const runPending = mainPending && today.session != null && (today.session.sport ?? "corrida") === "corrida"
    && today.session.type !== "strength";
  const doneRun = status?.done.find(d => d.kind === "run" && d.id);

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
      <p className="rounded-xl bg-brand-500/10 border border-brand-500/20 px-3 py-2 text-xs text-brand-200">
        Prévia da nova Home. A atual continua em <Link href="/" className="underline">Início</Link>.
      </p>

      <EntryPrompt refreshKey={refreshKey} />

      {/* ── 1. Hoje — the protagonist ─────────────────────────────────────── */}
      <Section title="Hoje" subtitle={dateLabel}>
        <Card density="roomy">
          <div className="space-y-4">
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
                {(status?.sessions ?? []).map((s, i) => (
                  <li key={`${s.sport}-${i}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`${i === 0 ? "text-2xl font-black" : "text-base font-semibold"} text-surface-100 leading-tight`}>
                        <span className="mr-2">{emojiOf(s.sport)}</span>{s.label}
                      </p>
                      {s.detail && <p className="text-sm text-surface-400 mt-0.5">{s.detail}{i === 0 && today.session?.pace ? ` · ${today.session.pace}` : ""}</p>}
                    </div>
                    <span className={`shrink-0 mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.done ? "bg-green-500/15 text-green-300" : "bg-surface-700/60 text-surface-400"
                    }`}>
                      {s.done ? <><Check className="w-3 h-3" /> feito</> : "previsto"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {today.why && today.state === "planned" && (
              <p className="text-xs text-surface-500 leading-relaxed">{today.why}</p>
            )}

            {/* Health as context of the session, one line — the depth lives in Saúde. */}
            {recovery && recovery.score != null && (
              <Link href="/health" className="flex items-center gap-2 text-xs text-surface-400 hover:text-surface-200">
                <HeartPulse className="w-3.5 h-3.5 text-brand-400" />
                <span>Recuperação {recovery.score} · {recovery.short}</span>
                <ArrowRight className="w-3 h-3 ml-auto" />
              </Link>
            )}

            {mainPending ? <TodayCheckPanel>{offer}</TodayCheckPanel> : offer}

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
                  <p key={`${d.label}-${i}`} className="text-sm text-surface-200">
                    {emojiOf(d.sport)} {d.label}
                    <span className="text-surface-500"> · {d.km != null ? `${num(d.km)} km · ` : ""}{formatMinutes(d.minutes)}{d.kcal ? ` · ${d.kcal} kcal` : ""}{d.planned ? "" : " · fora do plano"}</span>
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
          </div>
        </Card>
      </Section>

      {/* ── 2. Sua semana — every sport, a record, not a report ──────────── */}
      <Section
        title="Sua semana"
        subtitle={week.sessions > 0 ? `${formatMinutes(week.minutes)} em atividades · ${week.sessions} ${week.sessions === 1 ? "sessão" : "sessões"}` : "Nenhuma atividade registrada ainda"}
        action={<Link href="/calendar" className="text-xs text-surface-500 hover:text-surface-300">Histórico</Link>}
      >
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Dias da semana">
              {week.days.map((d, i) => (
                <button
                  key={d.date}
                  type="button"
                  role="tab"
                  aria-selected={i === selected}
                  onClick={() => setSelected(i)}
                  className={`min-h-[64px] rounded-xl flex flex-col items-center justify-start gap-1 pt-1.5 transition-colors ${
                    i === selected ? "bg-surface-700/70" : "hover:bg-surface-700/40"
                  }`}
                >
                  <span className={`text-[10px] uppercase ${d.isToday ? "text-brand-400 font-bold" : "text-surface-500"}`}>{d.short}</span>
                  <span className="flex flex-wrap justify-center gap-0.5 text-sm leading-none">
                    {d.done.map((x, k) => <span key={`d${k}`}>{emojiOf(x.sport)}</span>)}
                    {d.upcoming.map((x, k) => <span key={`u${k}`} className="opacity-30 grayscale">{emojiOf(x.sport)}</span>)}
                  </span>
                </button>
              ))}
            </div>

            {/* The selected day, right below — no second list to scroll to. */}
            <div className="rounded-xl bg-surface-800/50 px-3 py-2 space-y-1 min-h-[44px]">
              {day.done.length === 0 && day.upcoming.length === 0 && (
                <p className="text-xs text-surface-500">{day.isFuture ? "Nada previsto." : "Nenhuma atividade registrada."}</p>
              )}
              {day.done.map((x, k) => (
                <p key={`dd${k}`} className="text-sm text-surface-200">
                  {emojiOf(x.sport)} {x.label}
                  <span className="text-surface-500"> · {x.km != null ? `${num(x.km)} km · ` : ""}{formatMinutes(x.minutes)}{x.planned ? "" : " · fora do plano"}</span>
                  {x.kind === "run" && x.id && <Link href={`/runs/${x.id}`} className="ml-2 text-xs text-brand-400">ver</Link>}
                </p>
              ))}
              {day.upcoming.map((x, k) => (
                <p key={`uu${k}`} className="text-sm text-surface-500">
                  {emojiOf(x.sport)} {x.label}{x.detail ? ` · ${x.detail}` : ""} <span className="text-[11px]">· previsto</span>
                </p>
              ))}
            </div>

            {week.bySport.length > 0 && (
              <ul className="space-y-1.5">
                {week.bySport.map(s => (
                  <li key={s.label} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-surface-200">{s.emoji} {s.label}</span>
                    <span className="text-surface-400 tabular-nums">
                      {s.sessions} {s.sessions === 1 ? "sessão" : "sessões"}
                      {s.km != null && s.km > 0 ? ` · ${num(s.km)} km` : ""} · {formatMinutes(s.minutes)}
                    </span>
                  </li>
                ))}
                {week.calories && (
                  <li className="flex items-baseline justify-between gap-2 text-sm border-t border-surface-700/60 pt-1.5">
                    <span className="text-surface-200 inline-flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-orange-400" /> Calorias</span>
                    <span className="text-surface-400 tabular-nums">
                      {week.calories.kcal.toLocaleString("pt-BR")} kcal
                      <span className="text-surface-500 text-xs">
                        {week.calories.source === "relogio" ? " · ativas, do relógio" : week.calories.source === "misto" ? " · relógio + treinos" : " · nos treinos (Strava)"}
                      </span>
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </Card>
      </Section>

      {/* ── 3. At most one thing that deserves attention ─────────────────── */}
      {attention && (
        <Section title="Merece atenção">
          <Link href={attention.href} className="flex items-center justify-between gap-3 rounded-2xl border border-surface-700 px-4 py-3 min-h-[56px] hover:border-surface-600">
            <span className="text-sm text-surface-200">{attention.text}</span>
            <span className="shrink-0 inline-flex items-center gap-1 text-sm text-brand-400">{attention.action} <ArrowRight className="w-4 h-4" /></span>
          </Link>
        </Section>
      )}
    </div>
  );
}
