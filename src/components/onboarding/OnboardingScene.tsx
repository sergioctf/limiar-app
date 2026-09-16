"use client";

import {
  Flame, TrendingUp, Timer, Dumbbell, Sparkles, Trophy, Users,
  MapPin, Activity, Target, ChevronRight, Zap,
} from "lucide-react";
import { ExerciseImage } from "@/components/coach/ExerciseImage";
import type { SceneKey } from "@/lib/onboarding-flow";
import {
  DEMO_TEST, DEMO_PACES, DEMO_ZONES, DEMO_PREDICTIONS, DEMO_WORKOUT,
  DEMO_EXERCISES, DEMO_LOAD, DEMO_RUN_ANALYSIS, DEMO_ADVISOR, DEMO_FRIENDS,
  DEMO_RACE, DEMO_WEEK,
} from "@/lib/onboarding-scenes";

/**
 * The visual half of onboarding: what the app does, shown rather than claimed.
 *
 * Built from the app's own utility classes instead of screenshots, for two
 * reasons. A screenshot of a product that ships weekly is wrong within a month
 * — and it cannot follow the light/dark theme the athlete just picked. These
 * scenes restyle themselves for free.
 *
 * Everything is fake data and none of it is interactive. That is deliberate:
 * a scene that invites a tap the athlete cannot complete teaches them the app
 * is broken before they have used it.
 */
export function OnboardingScene({ scene }: { scene: SceneKey }) {
  return (
    <div className="rounded-2xl bg-surface-900/60 border border-surface-700 p-3 select-none">
      {RENDER[scene]()}
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────────────────── */

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-surface-500 font-semibold">{label}</p>
      {children}
    </div>
  );
}

function Stat({ value, unit, label, tint = "text-surface-100" }: {
  value: string; unit?: string; label: string; tint?: string;
}) {
  return (
    <div className="card p-2.5">
      <p className="stat-label mb-0.5">{label}</p>
      <p className={`text-lg font-black tabular-nums ${tint}`}>
        {value}{unit && <span className="text-[10px] font-medium text-surface-500 ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

/* ── scenes ──────────────────────────────────────────────────────────────── */

const RENDER: Record<SceneKey, () => JSX.Element> = {
  dashboard: () => (
    <Frame label="Painel">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Semana" value="44.5" unit="km" tint="text-brand-400" />
        <Stat label="Calorias" value="3.180" tint="text-surface-100" />
        <Stat label="30 dias" value="21" unit="dias" tint="text-surface-100" />
      </div>
      <div className="card p-2.5">
        <p className="stat-label mb-1.5">Plano da semana</p>
        <div className="grid grid-cols-7 gap-1">
          {DEMO_WEEK.map(d => (
            <div key={d.day} className="flex flex-col items-center gap-1 rounded-lg py-1.5 bg-surface-700/40">
              <span className="text-[10px] font-bold uppercase text-surface-500">{d.day}</span>
              <span className="flex gap-0.5 leading-none text-[10px]">
                {d.km != null && <span aria-hidden>🏃</span>}
                {d.strength && <span aria-hidden>🏋️</span>}
                {d.km == null && !d.strength && <span className="w-1.5 h-1.5 rounded-full bg-surface-600 mt-1" />}
              </span>
              <span className="text-[10px] text-surface-500">{d.km != null ? `${d.km}k` : "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  ),

  structuredRun: () => (
    <Frame label="Quarta-feira">
      <div className="card p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold text-surface-100">{DEMO_WORKOUT.title}</p>
          <span className="font-mono text-xs text-surface-400">{DEMO_WORKOUT.totalKm} km</span>
        </div>
        {DEMO_WORKOUT.blocks.map((b, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <span className={`w-1 self-stretch rounded-full ${b.tint}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-surface-200">
                {b.kind} <span className="text-surface-500 font-normal">· {b.detail}</span>
              </p>
              <p className="text-[10px] text-surface-400 font-mono">
                {b.pace}/km
                <span className="text-surface-500"> · {b.hr} bpm ({b.zone})</span>
              </p>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-surface-500 border-t border-surface-700/60 pt-2">
          Cada bloco com ritmo e faixa de batimento — e exportável para o relógio.
        </p>
      </div>
    </Frame>
  ),

  strengthCatalogue: () => (
    <Frame label="Segunda · Pernas">
      <div className="card p-2.5 space-y-1.5">
        {DEMO_EXERCISES.map(e => (
          <div key={e.id} className="flex items-center gap-2.5">
            <ExerciseImage exercise={{ name: e.name, image: e.image }} size="sm" eager />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-surface-100 truncate">{e.name}</p>
              <p className="text-[10px] text-surface-500">{e.sets} · RIR 2</p>
            </div>
            <span className="font-mono text-[11px] text-brand-400 shrink-0">{e.load}</span>
          </div>
        ))}
        <p className="text-[10px] text-surface-500 border-t border-surface-700/60 pt-2 flex items-center gap-1.5">
          <Dumbbell className="w-3 h-3" /> 277 exercícios com foto, carga sugerida a partir do seu histórico.
        </p>
      </div>
    </Frame>
  ),

  ai: () => (
    <Frame label="Treinador">
      <div className="space-y-1.5">
        {DEMO_ADVISOR.map((a, i) => (
          <div key={i} className={`card p-2.5 border-l-2 ${
            a.severity === "alta" ? "border-l-orange-500" : "border-l-yellow-500"
          }`}>
            <p className="text-[11px] font-bold text-surface-100 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-brand-400 shrink-0" /> {a.title}
            </p>
            <p className="text-[10px] text-surface-400 leading-relaxed mt-1">{a.body}</p>
          </div>
        ))}
        <p className="text-[10px] text-surface-500 px-1">
          O plano é calculado por motor determinístico. A IA lê os seus dados e comenta — nunca inventa números.
        </p>
      </div>
    </Frame>
  ),

  zones: () => (
    <Frame label={`Teste de ${DEMO_TEST.distanceKm} km · ${DEMO_TEST.timeLabel}`}>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="VDOT" value={String(DEMO_TEST.vdot)} tint="text-brand-400" />
        <Stat label="Limiar" value={String(DEMO_TEST.lthr)} unit="bpm" />
        <Stat label="FC máx" value={String(DEMO_TEST.hrMax)} unit="bpm" />
      </div>
      <div className="card p-2.5 space-y-1">
        {DEMO_ZONES.map(z => (
          <div key={z.zone} className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${z.bar}`} />
            <span className="text-[10px] font-semibold text-surface-300 w-6">{z.zone}</span>
            <span className="text-[10px] text-surface-400 flex-1">{z.name}</span>
            <span className="font-mono text-[10px] text-surface-300">{z.range}</span>
          </div>
        ))}
      </div>
      <div className="card p-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {DEMO_PACES.map(p => (
          <div key={p.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} />
              <span className="text-[10px] text-surface-300 truncate">{p.label}</span>
            </span>
            <span className="font-mono text-[10px] text-surface-300 shrink-0">{p.range}</span>
          </div>
        ))}
      </div>
    </Frame>
  ),

  predictions: () => (
    <Frame label="Se você corresse hoje">
      <div className="card p-3 space-y-2">
        {DEMO_PREDICTIONS.map(p => (
          <div key={p.label} className="flex items-baseline gap-3">
            <span className="text-[11px] text-surface-400 w-16">{p.label}</span>
            <span className="text-base font-black text-surface-100 tabular-nums">{p.time}</span>
            <span className="font-mono text-[10px] text-surface-500 ml-auto">{p.pace}</span>
          </div>
        ))}
        <p className="text-[10px] text-surface-500 border-t border-surface-700/60 pt-2">
          Recalculado a cada teste — dá para ver a projeção melhorar ao longo do bloco.
        </p>
      </div>
    </Frame>
  ),

  trainingLoad: () => (
    <Frame label="Carga de treino">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Forma" value={String(DEMO_LOAD.ctl)} tint="text-surface-100" />
        <Stat label="Fadiga" value={String(DEMO_LOAD.atl)} tint="text-surface-100" />
        <Stat label="Saldo" value={`+${DEMO_LOAD.tsb}`} tint="text-surface-100" />
      </div>
      <div className="card p-3">
        <div className="flex items-end gap-1 h-16">
          {DEMO_LOAD.series.map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-brand-500/60"
                 style={{ height: `${(v / 55) * 100}%` }} />
          ))}
        </div>
        <p className="text-[10px] text-surface-500 mt-2 flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3" /> Volume por semana, com a semana de consolidação embutida.
        </p>
      </div>
    </Frame>
  ),

  history: () => (
    <Frame label={DEMO_RUN_ANALYSIS.title}>
      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-surface-100">{DEMO_RUN_ANALYSIS.distanceKm} km</span>
          <span className="font-mono text-xs text-surface-300">{DEMO_RUN_ANALYSIS.time}</span>
          <span className="font-mono text-xs text-surface-400">{DEMO_RUN_ANALYSIS.pace}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-surface-500">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{DEMO_RUN_ANALYSIS.hr} bpm</span>
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{DEMO_RUN_ANALYSIS.elevation} m D+</span>
        </div>
        <div className="flex items-end gap-1 h-10">
          {DEMO_RUN_ANALYSIS.splits.map((s, i) => (
            <div key={i} className="flex-1 rounded-t bg-green-500/50"
                 style={{ height: `${100 - (s - 4.9) * 120}%` }} />
          ))}
        </div>
        <p className="text-[10px] text-surface-400 leading-relaxed border-t border-surface-700/60 pt-2 flex items-start gap-1.5">
          <Sparkles className="w-3 h-3 text-brand-400 shrink-0 mt-0.5" />
          {DEMO_RUN_ANALYSIS.verdict}
        </p>
      </div>
    </Frame>
  ),

  races: () => (
    <Frame label="Próxima prova">
      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-brand-400" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-surface-100">{DEMO_RACE.name}</p>
            <p className="text-[10px] text-surface-500">{DEMO_RACE.date} · faltam {DEMO_RACE.weeksAway} semanas</p>
          </div>
          <span className="ml-auto font-mono text-sm text-brand-300">{DEMO_RACE.target}</span>
        </div>
        <div className="flex items-center gap-1">
          {["Base", "Construção", "Pico", "Polimento"].map(f => (
            <span key={f} className={`flex-1 text-center text-[10px] py-1 rounded ${
              f === DEMO_RACE.phase
                ? "bg-brand-500/25 text-surface-100 font-semibold"
                : "bg-surface-700/40 text-surface-500"
            }`}>{f}</span>
          ))}
        </div>
        <p className="text-[10px] text-surface-500 flex items-center gap-1.5">
          <Target className="w-3 h-3" /> O plano inteiro se organiza em torno da data, até a estratégia de ritmo.
        </p>
      </div>
    </Frame>
  ),

  friends: () => (
    <Frame label="Ranking da semana">
      <div className="card p-2.5 space-y-1.5">
        {DEMO_FRIENDS.map((f, i) => (
          <div key={f.name} className={`flex items-center gap-2.5 rounded-lg p-1.5 ${
            f.me ? "bg-brand-500/10" : ""
          }`}>
            <span className="text-[10px] font-bold text-surface-300 w-3">{i + 1}</span>
            <span className="w-6 h-6 rounded-full bg-surface-700 grid place-items-center text-[10px] font-bold text-surface-300">
              {f.initial}
            </span>
            <span className={`text-[11px] flex-1 ${f.me ? "font-bold text-surface-100" : "text-surface-200"}`}>
              {f.name}
            </span>
            <span className="font-mono text-[11px] text-surface-300">{f.days} dias</span>
          </div>
        ))}
        <p className="text-[10px] text-surface-500 border-t border-surface-700/60 pt-2 flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Desafios, kudos e o feed de quem treina com você.
        </p>
      </div>
    </Frame>
  ),
};
