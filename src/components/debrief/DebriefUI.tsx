"use client";

import { Check } from "lucide-react";
import { ChromeRibbon, type RibbonState } from "@/components/brand/ChromeRibbon";
import { PERCEPTIONS, rpeLabel, type Perception } from "@/lib/debrief";
import { VoiceInput } from "@/components/ai/VoiceInput";

export function DebriefHeader({ state, title, subtitle, children }: {
  state: RibbonState;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="limiar-feature px-4 pb-4 sm:px-5">
      <div className="mx-auto max-w-[290px]">
        <ChromeRibbon state={state} className="h-[88px] w-full" />
      </div>
      <p className="limiar-kicker">{state === "success" ? <Check className="mr-1 inline h-4 w-4" aria-hidden /> : null} Limiar Debrief</p>
      <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-surface-100">{title}</h2>
      <p className="mt-1 text-sm text-surface-400">{subtitle}</p>
      {children}
    </div>
  );
}

export const debriefChoice = (selected: boolean) => `min-h-[44px] rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${selected
  ? "limiar-segment-active border-brand-500/50 text-brand-400"
  : "border-surface-600 bg-surface-800 text-surface-300 hover:border-brand-500/40"}`;

export function EffortSelector({ perception, rpe, onPerception, onRpe, disabled }: {
  perception: Perception | null;
  rpe: number | null;
  onPerception: (value: Perception) => void;
  onRpe: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-surface-200">Como seu corpo respondeu hoje?</legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.entries(PERCEPTIONS) as [Perception, string][]).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={perception === key} onClick={() => onPerception(key)}
            className={debriefChoice(perception === key)}>{label}</button>
        ))}
      </div>
      <details className="rounded-xl border border-surface-700 px-3">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-surface-300">
          {rpe == null ? "Adicionar PSE de 0 a 10 (opcional)" : `PSE ${rpe}/10 · ${rpeLabel(rpe)}`}
        </summary>
        <div className="space-y-2 pb-3">
          <p className="text-xs text-surface-400">Percepção subjetiva de esforço. De repouso a esforço máximo.</p>
          <div role="group" aria-label="Escala de esforço" className="grid grid-cols-6 gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button type="button" key={n} aria-label={`${n}, ${rpeLabel(n)}`} aria-pressed={rpe === n}
                className={debriefChoice(rpe === n) + " !px-0 tabular-nums"} onClick={() => onRpe(n === rpe ? null : n)}>{n}</button>
            ))}
          </div>
        </div>
      </details>
    </fieldset>
  );
}

export function DebriefObservation({ note, onNote, disabled, onVoiceState }: {
  note: string;
  onNote: (value: string) => void;
  disabled?: boolean;
  onVoiceState?: (value: "listening" | "thinking" | null) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-surface-200">
        Observação <span className="font-normal text-surface-500">(opcional)</span>
        <textarea rows={2} maxLength={300} value={note} disabled={disabled}
          onChange={event => onNote(event.target.value)}
          placeholder="Algo que você quer lembrar sobre este treino?"
          className="input mt-2 w-full" />
      </label>
      <VoiceInput disabled={disabled}
        onState={state => onVoiceState?.(state === "listening" || state === "thinking" ? state : null)}
        onText={text => onNote([note.trim(), text].filter(Boolean).join(" ").slice(0, 300))} />
    </div>
  );
}

export function DebriefMetrics({ actual, planned }: { actual: string; planned?: string | null }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-surface-700 pt-3">
      <div>
        <dt className="text-xs text-surface-500">Realizado</dt>
        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-surface-100">{actual}</dd>
      </div>
      <div>
        <dt className="text-xs text-surface-500">Planejado</dt>
        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-surface-200">{planned ?? "Sem vínculo confirmado"}</dd>
      </div>
    </dl>
  );
}
