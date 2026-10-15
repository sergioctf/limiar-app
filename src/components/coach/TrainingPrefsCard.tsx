"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2, Check, Info, RefreshCw } from "lucide-react";
import type { DayKey, TrainingPrefs } from "@/types";
import { localNextMondayStr } from "@/lib/week";

const DAYS: Array<{ key: DayKey; short: string }> = [
  { key: "Mon", short: "Seg" },
  { key: "Tue", short: "Ter" },
  { key: "Wed", short: "Qua" },
  { key: "Thu", short: "Qui" },
  { key: "Fri", short: "Sex" },
  { key: "Sat", short: "Sáb" },
  { key: "Sun", short: "Dom" },
];

/**
 * Weekly layout editor. Everyone trains differently — the plan follows the days
 * the athlete picks here rather than a fixed template.
 */
export function TrainingPrefsCard() {
  const [prefs, setPrefs] = useState<TrainingPrefs | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/training-prefs")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.prefs) return;
        setPrefs(d.prefs);
        setWarnings(d.warnings ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function save(next: TrainingPrefs): Promise<boolean> {
    setPrefs(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/coach/training-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setWarnings(d?.warnings ?? []);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        return true;
      } else {
        setError(d?.error ?? "Não foi possível salvar.");
      }
    } catch {
      setError("Falha na conexão.");
    } finally {
      setSaving(false);
    }
    return false;
  }

  const [hillsNote, setHillsNote] = useState<string | null>(null);

  /**
   * "Não faço treino em ladeira" (Sérgio, 16/09). The week in progress is never
   * rewritten, so the change lands on the next one — rebuilt right away, so the
   * athlete does not open next Monday to the session they just opted out of.
   */
  async function toggleHills(exclude: boolean) {
    const current = prefs?.excludedQuality ?? [];
    const next = exclude
      ? Array.from(new Set([...current, "hills" as const]))
      : current.filter(kind => kind !== "hills");
    if (!prefs || !(await save({ ...prefs, excludedQuality: next }))) return;
    setHillsNote(exclude ? "Sem subidas a partir da próxima semana." : "Subidas de volta ao rodízio a partir da próxima semana.");
    await fetch("/api/coach/weekly-plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: localNextMondayStr(), force: true }),
    }).catch(() => {});
  }

  if (!prefs) {
    return (
      <div className="card p-4 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando preferências…
      </div>
    );
  }

  const toggle = (list: DayKey[], d: DayKey) =>
    list.includes(d) ? list.filter(x => x !== d) : [...list, d];

  const runDays = prefs.runDays ?? [];

  return (
    <div id="training-prefs" className="card p-4 space-y-4 scroll-mt-20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-surface-100 text-sm flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-brand-400" /> Sua semana
          </h3>
          <p className="text-[11px] text-surface-500">
            Escolha os dias — o plano se molda a você, não o contrário
          </p>
        </div>
        {saving ? <Loader2 className="w-4 h-4 animate-spin text-surface-500 shrink-0" />
          : saved ? <Check className="w-4 h-4 text-green-400 shrink-0" /> : null}
      </div>

      {/* Run days */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
          Dias de corrida ({runDays.length}/semana)
        </p>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => {
            const on = runDays.includes(d.key);
            return (
              <button
                key={d.key}
                onClick={() => save({ ...prefs, runDays: toggle(runDays, d.key), runDaysConfirmed: true })}
                disabled={saving}
                aria-pressed={on}
                className={`min-h-[44px] rounded-lg text-xs font-bold transition-colors disabled:opacity-60 ${
                  on ? "bg-brand-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Long run day */}
      {runDays.length > 1 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
            Dia do longão
          </p>
          <div className="flex gap-1 flex-wrap">
            {DAYS.filter(d => runDays.includes(d.key)).map(d => {
              const on = (prefs.longRunDay ?? runDays[runDays.length - 1]) === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => save({ ...prefs, longRunDay: d.key, runDaysConfirmed: true })}
                  disabled={saving}
                  className={`px-3 min-h-[44px] py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                    on ? "bg-purple-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quality sessions */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
          Treinos fortes por semana
        </p>
        <div className="flex gap-1">
          {[0, 1, 2].map(n => (
            <button
              key={n}
              onClick={() => save({ ...prefs, qualityPerWeek: n })}
              disabled={saving}
              className={`flex-1 min-h-[44px] py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                (prefs.qualityPerWeek ?? 1) === n
                  ? "bg-orange-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
              }`}
            >
              {n === 0 ? "nenhum" : n}
            </button>
          ))}
        </div>
      </div>

      {/*
        Por km ou por tempo.

        As duas escolas são legítimas, e a diferença é real: num dia ruim, 8 km
        custam uma hora; 45 minutos custam 45 minutos. O motor continua
        prescrevendo em quilômetros — muda a unidade em que o plano é lido e o
        alvo que vai para o relógio (Sérgio, 13/10).
      */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-surface-500">
          Como você mede seus treinos
        </p>
        <div className="flex gap-1">
          {(["km", "time"] as const).map(m => (
            <button
              key={m}
              onClick={() => save({ ...prefs, measureBy: m })}
              disabled={saving}
              aria-pressed={(prefs.measureBy ?? "km") === m}
              className={`min-h-[44px] flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                (prefs.measureBy ?? "km") === m
                  ? "bg-brand-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
              }`}
            >
              {m === "km" ? "Distância (km)" : "Tempo (min)"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-surface-500">
          {(prefs.measureBy ?? "km") === "km"
            ? "Os treinos aparecem em quilômetros."
            : "Os treinos aparecem em minutos, convertidos pelo seu ritmo. A distância continua contando no volume da semana."}
        </p>
      </div>

      {/* Session types the athlete does not do */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
          Tipos de treino
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={(prefs.excludedQuality ?? []).includes("hills")}
          onClick={() => toggleHills(!(prefs.excludedQuality ?? []).includes("hills"))}
          disabled={saving}
          className="w-full min-h-[44px] flex items-center justify-between gap-3 rounded-lg bg-surface-700/50 px-3 text-left text-xs text-surface-300 disabled:opacity-60"
        >
          <span>Não faço treino em ladeira</span>
          <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${(prefs.excludedQuality ?? []).includes("hills") ? "bg-brand-500" : "bg-surface-600"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${(prefs.excludedQuality ?? []).includes("hills") ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
        {hillsNote && <p className="text-[11px] text-surface-500 mt-1.5" aria-live="polite">{hillsNote}</p>}
      </div>

      {/* Strength days */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
          Dias de musculação
        </p>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => {
            const on = (prefs.strengthDays ?? []).includes(d.key);
            return (
              <button
                key={d.key}
                onClick={() => save({ ...prefs, strengthDays: toggle(prefs.strengthDays ?? [], d.key) })}
                disabled={saving}
                aria-pressed={on}
                className={`min-h-[44px] rounded-lg text-xs font-bold transition-colors disabled:opacity-60 ${
                  on ? "bg-blue-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-surface-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-surface-500" />{w}
            </p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-surface-500 leading-relaxed">
        As sessões são distribuídas nos seus dias como leve → forte → longão.
      </p>

      <RegeneratePlan />
    </div>
  );
}

/**
 * Aplicar o que acabou de ser escolhido.
 *
 * Esta tela mudava a configuração e mandava o atleta "usar Regenerar no plano"
 * — um botão que o redesenho do Treinador tinha removido. Quem trocava os dias
 * de corrida ficava com o texto apontando para lugar nenhum e um plano que não
 * mudava (um usuário relatou isso em 02/10).
 *
 * A regeneração já existia; faltava uma porta. Esta é a mesma rota do aviso de
 * plano desatualizado — e o aviso só aparece quando o motor detecta a diferença
 * **e** nenhum outro aviso mais urgente está ocupando a faixa acima do plano.
 * Aqui ela fica sempre disponível, ao lado do que a provoca.
 *
 * **A semana em curso nunca é reescrita** — `regenerationTarget` congela toda
 * semana que já começou, o que na prática é sempre a de hoje. Por isso o botão
 * promete a próxima, e não "aplicar agora": prometer o que o motor recusa é
 * como o atleta acaba apertando o mesmo botão dez vezes esperando a semana
 * mudar. A exceção é quem ainda não tem plano nenhum nesta semana; aí não há o
 * que tirar de ninguém, e as duas são montadas.
 */
function RegeneratePlan() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function regenerate() {
    setState("saving");
    setResult(null);
    try {
      const res = await fetch("/api/coach/weekly-plan/freshness", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setResult(d?.error ?? "Não foi possível atualizar o plano. Tente de novo.");
        return;
      }
      const refeitas = (d?.rebuilt as string[] | undefined)?.length ?? 0;
      setResult(
        refeitas > 1
          ? "Pronto — esta semana e a próxima foram montadas com os seus dias."
          : refeitas === 1
            ? "Pronto — a próxima semana foi montada com os seus dias."
            : "O plano não mudou. Esta semana já começou e não é reescrita.",
      );
      // O plano na tela veio do servidor: sem isto, o aviso de sucesso aparece
      // em cima exatamente das sessões que ele acabou de substituir.
      router.refresh();
    } catch {
      setResult("Falha na conexão. Tente de novo.");
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="space-y-2 border-t border-surface-700/60 pt-3">
      <button
        onClick={regenerate}
        disabled={state === "saving"}
        className="btn-primary min-h-[48px] w-full justify-center"
      >
        {state === "saving"
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Montando a semana…</>
          : <><RefreshCw className="h-4 w-4" /> Montar a próxima semana com estes dias</>}
      </button>
      <p className="text-[11px] leading-relaxed text-surface-500" aria-live="polite">
        {result ?? "A semana em curso não é reescrita — você já se organizou em torno dela. Os dias novos valem a partir de segunda."}
      </p>
    </div>
  );
}
