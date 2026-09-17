"use client";

/**
 * "Adaptar este treino" — the athlete decides, the coach takes part.
 *
 * Reason → two or three alternatives (one recommended) → or the athlete's own
 * proposal, read and judged by the coach → the accepted version replaces the
 * day, the original stays in history, and the post-run feedback compares
 * against what was agreed. Undo puts the original back.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ADAPT_REASONS, VERDICT_LABEL, isAdaptable,
  type AdaptOption, type AdaptReason, type ProposalEvaluation,
} from "@/lib/session-adapt";
import { isRepeatBlock, type WeeklyPlanDay, type WorkoutStep } from "@/types";

const kmLabel = (n: number | undefined) => (n == null ? "" : `${Number(n.toFixed(2)).toString().replace(".", ",")} km`);

function stepLabel(step: WorkoutStep): string {
  if (step.distance_km != null) return step.distance_km >= 1 ? kmLabel(step.distance_km) : `${Math.round(step.distance_km * 1000)} m`;
  if (step.duration_min != null) return step.duration_min < 1 ? `${Math.round(step.duration_min * 60)} s` : `${String(step.duration_min).replace(".", ",")} min`;
  return "";
}

/** "1,5 km aquec. · 6× 45 s (rec. 2 min) · 1 km desaq." */
export function structureSummary(day: WeeklyPlanDay): string {
  if (!day.structure) return day.distance_km ? kmLabel(day.distance_km) : "";
  return day.structure.blocks.map(b => {
    if (isRepeatBlock(b)) {
      const work = b.steps.find(s => s.kind === "run");
      const rest = b.steps.find(s => s.kind === "recovery");
      return `${b.repeat}× ${work ? stepLabel(work) : ""}${rest ? ` (rec. ${stepLabel(rest)})` : ""}`;
    }
    const what = stepLabel(b);
    return b.kind === "warmup" ? `${what} aquec.` : b.kind === "cooldown" ? `${what} desaq.` : what;
  }).join(" · ");
}

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/coach/adapt", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Não foi possível agora. Tente de novo.");
  return data;
}

const chip = "rounded-xl border border-surface-600 px-3 py-2 min-h-[44px] text-sm text-left transition-colors hover:border-brand-400 disabled:opacity-50";

function SessionCard({ day, minutes, children }: { day: WeeklyPlanDay; minutes?: number; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-surface-700 bg-surface-800 p-3 space-y-1.5">
      <p className="font-semibold text-surface-100">{day.label}</p>
      <p className="text-xs text-surface-400">
        {minutes != null ? `≈ ${minutes} min` : ""}{minutes != null && day.distance_km ? " · " : ""}{day.distance_km ? kmLabel(day.distance_km) : ""}
      </p>
      <p className="text-xs text-surface-400">{structureSummary(day)}</p>
      {children}
    </div>
  );
}

export function AdaptSessionSheet({ day, onClose, onAdapted }: {
  day: WeeklyPlanDay;
  onClose: () => void;
  onAdapted: (day: WeeklyPlanDay) => void;
}) {
  const [step, setStep] = useState<"reason" | "options" | "custom" | "done">("reason");
  const [reason, setReason] = useState<AdaptReason | null>(null);
  const [options, setOptions] = useState<AdaptOption[] | null>(null);
  const [limitation, setLimitation] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [evaluation, setEvaluation] = useState<ProposalEvaluation | null>(null);
  const [adapted, setAdapted] = useState<WeeklyPlanDay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const original = day.adaptation?.original ?? day;

  // Through a ref: the parent re-renders when the plan updates, and re-running
  // this effect would pull focus out of the text field mid-typing.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); };
  }, []);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true); setError("");
    try { return await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível agora."); return undefined; }
    finally { setBusy(false); }
  }

  async function chooseReason(r: AdaptReason) {
    setReason(r);
    const data = await run(() => post({ action: "options", day: day.day, reason: r }));
    if (!data) return;
    setOptions(data.options ?? []);
    setLimitation(data.limitation ?? null);
    setStep("options");
  }

  async function evaluate() {
    const data = await run(() => post({ action: "evaluate", day: day.day, text }));
    if (data) setEvaluation(data.evaluation);
  }

  async function accept(body: Record<string, unknown>) {
    const data = await run(() => post({ action: "accept", day: day.day, reason, ...body }));
    if (!data?.day) return;
    setAdapted(data.day);
    setStep("done");
    onAdapted(data.day);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        ref={dialog} role="dialog" aria-modal="true" aria-label="Adaptar este treino" tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-surface-700 bg-surface-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up outline-none space-y-4"
      >
        <div>
          <p className="text-xs text-brand-400 font-semibold">SEU TREINADOR · ADAPTAR O TREINO</p>
          <h2 className="font-semibold mt-1">{step === "done" ? "Treino adaptado" : original.label}</h2>
          {step !== "done" && <p className="text-xs text-surface-400 mt-0.5">{structureSummary(original)}</p>}
        </div>

        {step === "reason" && (
          <>
            <p className="text-sm font-medium">O que precisa mudar?</p>
            <div className="grid gap-2">
              {(Object.entries(ADAPT_REASONS) as Array<[AdaptReason, string]>).map(([key, label]) => (
                <button key={key} type="button" disabled={busy} onClick={() => chooseReason(key)} className={chip}>{label}</button>
              ))}
            </div>
            <button type="button" className="text-sm text-brand-400 min-h-[44px]" onClick={() => setStep("custom")}>
              Já sei o que quero fazer — propor meu treino
            </button>
          </>
        )}

        {step === "options" && (
          <>
            {limitation && <p className="rounded-xl bg-surface-800 p-3 text-sm text-surface-300">{limitation}</p>}
            {(options ?? []).map(option => (
              <SessionCard key={option.id} day={option.day} minutes={option.estimatedMin}>
                {option.recommended && <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-400">Recomendada</p>}
                <p className="text-sm text-surface-300"><span className="text-surface-500">Preserva:</span> {option.preserves}</p>
                <p className="text-sm text-surface-300"><span className="text-surface-500">Muda:</span> {option.changes}</p>
                <p className="text-sm text-surface-300"><span className="text-surface-500">Por quê:</span> {option.why}</p>
                <button type="button" disabled={busy} onClick={() => accept({ source: "option", optionId: option.id })}
                  className="mt-1 rounded-xl bg-brand-500 text-white px-4 min-h-[44px] text-sm disabled:opacity-50">
                  {busy ? "Salvando…" : "Usar esta"}
                </button>
              </SessionCard>
            ))}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="text-sm text-brand-400 min-h-[44px]" onClick={() => setStep("custom")}>Propor meu treino</button>
              <button type="button" className="text-sm text-surface-400 min-h-[44px]" onClick={() => setStep("reason")}>Voltar</button>
            </div>
          </>
        )}

        {step === "custom" && (
          <>
            <label className="block text-sm font-medium" htmlFor="adapt-text">Qual treino você quer fazer?</label>
            <textarea id="adapt-text" className="input w-full" rows={2} maxLength={200} value={text}
              placeholder="Ex.: 8 × 400 m com 2 min de trote"
              onChange={e => { setText(e.target.value); setEvaluation(null); }} disabled={busy} />
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy || !text.trim()} onClick={evaluate}
                className="rounded-xl bg-brand-500 text-white px-4 min-h-[44px] text-sm disabled:opacity-50">
                {busy ? "Avaliando…" : "Avaliar"}
              </button>
              <button type="button" className="text-sm text-surface-400 min-h-[44px]" onClick={() => { setStep(options ? "options" : "reason"); setEvaluation(null); }}>Voltar</button>
            </div>

            {evaluation && !evaluation.understood && (
              <p className="rounded-xl bg-surface-800 p-3 text-sm text-surface-300">
                Para avaliar, preciso saber {evaluation.missing.join(" e ")}.
              </p>
            )}

            {evaluation?.understood && evaluation.day && (
              <div className="space-y-3">
                <SessionCard day={evaluation.day} minutes={evaluation.day.duration_min}>
                  {evaluation.verdict && (
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                      evaluation.verdict === "equivalent" ? "text-emerald-400" : evaluation.verdict === "partial" ? "text-amber-400" : "text-red-400"
                    }`}>{VERDICT_LABEL[evaluation.verdict]}</p>
                  )}
                  <p className="text-sm text-surface-200">{evaluation.message}</p>
                  {evaluation.preserves && <p className="text-sm text-surface-300"><span className="text-surface-500">Preserva:</span> {evaluation.preserves}</p>}
                  {evaluation.changes && <p className="text-sm text-surface-300"><span className="text-surface-500">Muda:</span> {evaluation.changes}</p>}
                  {evaluation.assumptions.length > 0 && (
                    <p className="text-xs text-surface-500">Assumi: {evaluation.assumptions.join("; ")}. Se for diferente, escreva no texto.</p>
                  )}
                  <button type="button" disabled={busy} onClick={() => accept({ source: "custom", text, useAdjusted: false })}
                    className="mt-1 rounded-xl border border-surface-600 px-4 min-h-[44px] text-sm disabled:opacity-50">
                    Usar a minha versão
                  </button>
                </SessionCard>

                {evaluation.adjusted && (
                  <SessionCard day={evaluation.adjusted.day} minutes={evaluation.adjusted.day.duration_min}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-400">Sugestão do treinador</p>
                    <p className="text-sm text-surface-300">{evaluation.adjusted.why}</p>
                    <button type="button" disabled={busy} onClick={() => accept({ source: "custom", text, useAdjusted: true })}
                      className="mt-1 rounded-xl bg-brand-500 text-white px-4 min-h-[44px] text-sm disabled:opacity-50">
                      Usar a sugestão
                    </button>
                  </SessionCard>
                )}
              </div>
            )}
          </>
        )}

        {step === "done" && adapted && (
          <>
            <SessionCard day={adapted} minutes={adapted.duration_min} />
            <p className="text-sm text-surface-300">
              O feedback depois do treino vai comparar com esta versão. O treino original ({original.label}) fica guardado no histórico.
            </p>
            <button type="button" onClick={onClose} className="rounded-xl bg-brand-500 text-white px-4 min-h-[44px] text-sm">Fechar</button>
          </>
        )}

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

/** The entry point: a button on today's session, or the adapted state with undo. */
export function AdaptSessionControl({ day, onChanged }: { day: WeeklyPlanDay; onChanged?: (day: WeeklyPlanDay) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Screens that hold the plan in state update it; the rest re-read from the server.
  const changed = (next: WeeklyPlanDay) => (onChanged ? onChanged(next) : router.refresh());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = day.adaptation?.original ?? day;
  if (!isAdaptable(base) || day.swap) return null;

  async function undo() {
    setBusy(true); setError("");
    try {
      const data = await post({ action: "undo", day: day.day });
      if (data?.day) changed(data.day);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desfazer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {day.adaptation?.when === "after" ? (
        <div className="rounded-xl bg-surface-700/40 px-3 py-2 text-xs text-surface-400">
          Previsto: <span className="text-surface-200">{day.label}</span>. Você registrou no check-in:{" "}
          {/* The parsed name when the coach understood the session; the athlete's own words otherwise. */}
          <span className="text-surface-200">
            {day.adaptation.doneLabel?.includes(":") ? day.adaptation.doneLabel
              : day.adaptation.text ?? day.adaptation.doneLabel ?? "outro treino"}
          </span>
          {day.adaptation.doneKm ? ` — ${String(day.adaptation.doneKm).replace(".", ",")} km` : ""}.
        </div>
      ) : day.adaptation ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-700/40 px-3 py-2 text-xs text-surface-400">
          <span>Adaptado de <span className="text-surface-200">{day.adaptation.original.label}</span></span>
          <span className="flex gap-3">
            <button type="button" className="min-h-[44px] text-brand-400" onClick={() => setOpen(true)}>Adaptar de novo</button>
            <button type="button" className="min-h-[44px] text-surface-400" disabled={busy} onClick={undo}>Desfazer</button>
          </span>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center min-h-[44px] rounded-xl border border-surface-600 text-sm text-surface-300 hover:border-brand-400">
          Adaptar este treino
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {open && (
        <AdaptSessionSheet day={day} onClose={() => setOpen(false)} onAdapted={changed} />
      )}
    </div>
  );
}
