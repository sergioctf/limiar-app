"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Flame, Droplets, Watch } from "lucide-react";
import { CountUp } from "@/components/shared/CountUp";
import { Disclosure } from "@/components/ui/Disclosure";
import { NutritionCard, type NutritionSummary } from "@/components/health/NutritionCard";
import { fuelingPlan, type CalorieGoal } from "@/lib/nutrition";
import { haptic } from "@/lib/haptics";

const GOAL_LABEL: Record<CalorieGoal, string> = { maintain: "Manter", cut: "Perder gordura", gain: "Ganhar massa" };

/**
 * The day's energy: what the body spends, and what to eat to match the goal.
 *
 * The old card was three equal boxes — basal, training, target — so the target,
 * the only number anyone acts on, was the same size as its ingredients. Here the
 * target leads, and the bar underneath shows what it is built from and which
 * parts the watch actually measured.
 */
export function EnergyCard({ data }: { data: NutritionSummary }) {
  const router = useRouter();
  const [goal, setGoal] = useState<CalorieGoal>(data.goal);
  const [tip, setTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [fuelMin, setFuelMin] = useState(90);
  const [weight, setWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightError, setWeightError] = useState<string | null>(null);

  async function saveWeight() {
    const kg = Number(weight.replace(",", "."));
    if (!Number.isFinite(kg) || kg < 30 || kg > 250) { setWeightError("Informe um peso válido"); return; }
    setSavingWeight(true);
    setWeightError(null);
    try {
      const res = await fetch("/api/health/body", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight_kg: kg }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao salvar");
      haptic("success");
      router.refresh();
    } catch (e) {
      setWeightError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSavingWeight(false);
    }
  }

  /*
   * Only the weight is missing — the common case, since height, sex and birth
   * date are asked once at signup. The full profile form here asked again for
   * three things the athlete had already given, to get the one they had not.
   */
  const onlyWeightMissing = !data.complete && !data.weightKg && data.heightCm && data.sex && data.birthDate;
  if (onlyWeightMissing) {
    return (
      <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
        <p className="text-sm font-semibold text-surface-100">Falta só o seu peso</p>
        <p className="mt-0.5 text-xs text-surface-500">Com ele sai a meta de calorias e os macros do dia.</p>
        {data.watchWeightKg != null && !weight && (
          <button
            onClick={() => setWeight(String(data.watchWeightKg).replace(".", ","))}
            className="mt-2 text-xs text-brand-400 hover:text-brand-300"
          >
            O perfil do Garmin diz {String(data.watchWeightKg).replace(".", ",")} kg — usar esse valor?
          </button>
        )}
        <div className="mt-3 flex gap-2">
          <input
            type="text" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)}
            placeholder="kg (ex: 77,0)"
            className="min-h-[44px] flex-1 rounded-xl border border-surface-700 bg-surface-900 px-3 text-sm text-surface-200 focus:border-brand-500 focus:outline-none"
          />
          <button onClick={saveWeight} disabled={savingWeight || !weight.trim()} className="btn-primary">
            {savingWeight ? <Loader2 className="w-4 h-4 animate-spin" /> : "Calcular"}
          </button>
        </div>
        {weightError && <p className="mt-2 text-xs text-red-400">{weightError}</p>}
      </div>
    );
  }

  if (!data.complete || data.target == null || data.bmr == null || data.macros == null) {
    return <NutritionCard data={data} />;
  }

  const active = data.activeKcal ?? Math.max(0, (data.tdee ?? data.bmr) - data.bmr);
  const spend = data.bmr + active;
  const basalPct = (data.bmr / spend) * 100;
  const fuel = fuelingPlan(fuelMin, "easy");

  const macroKcal = {
    carbs: data.macros.carbs_g * 4,
    protein: data.macros.protein_g * 4,
    fat: data.macros.fat_g * 9,
  };
  const macroTotal = macroKcal.carbs + macroKcal.protein + macroKcal.fat || 1;

  async function changeGoal(g: CalorieGoal) {
    setGoal(g);
    haptic("tap");
    await fetch("/api/health/nutrition-profile", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calorie_goal: g }),
    });
    router.refresh();
  }

  async function loadTip() {
    setTipLoading(true);
    try {
      const res = await fetch("/api/health/diet-tip");
      const d = await res.json();
      setTip(res.ok ? d.tip : (d.error ?? "Não foi possível gerar a dica."));
    } catch {
      setTip("Erro ao gerar a dica.");
    } finally { setTipLoading(false); }
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Comer hoje</p>
            <p className="mt-1 text-4xl font-black tabular-nums leading-none text-surface-100">
              <CountUp value={data.target} />
              <span className="ml-1 text-sm font-semibold text-surface-500">kcal</span>
            </p>
          </div>
          <p className="pb-1 text-right text-xs text-surface-500">
            gasto {spend.toLocaleString("pt-BR")} kcal
            <br />
            {goal === "maintain" ? "para manter" : goal === "cut" ? "com déficit de 400" : "com superávit de 300"}
          </p>
        </div>

        {/* What the spend is made of. */}
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-700">
          <div className="h-full bg-surface-500 transition-all duration-700" style={{ width: `${basalPct}%` }} />
          <div className="h-full bg-violet-400 transition-all duration-700" style={{ width: `${100 - basalPct}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-1 text-surface-400">
            <span className="h-2 w-2 rounded-full bg-surface-500" /> Basal {data.bmr.toLocaleString("pt-BR")}
            {data.bmrSource === "watch" && <Watch className="w-3 h-3 text-emerald-400" aria-label="medido pelo relógio" />}
          </span>
          <span className="flex items-center gap-1 text-surface-400">
            <span className="h-2 w-2 rounded-full bg-violet-400" />
            {data.activeSource === "watch" ? "Ativo" : "Movimento + treino"} {active.toLocaleString("pt-BR")}
            {data.activeSource === "watch" && <Watch className="w-3 h-3 text-emerald-400" aria-label="medido pelo relógio" />}
          </span>
        </div>

        {/* Macros as shares of the target, so the split is visible, not just listed. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {([
            ["Carbo", data.macros.carbs_g, macroKcal.carbs, "bg-violet-400"],
            ["Proteína", data.macros.protein_g, macroKcal.protein, "bg-sky-400"],
            ["Gordura", data.macros.fat_g, macroKcal.fat, "bg-amber-300"],
          ] as const).map(([label, g, kcal, color]) => (
            <div key={label} className="rounded-xl bg-surface-700/30 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-surface-500">{label}</p>
              <p className="text-lg font-black tabular-nums text-surface-100">{g}<span className="text-xs font-semibold text-surface-500">g</span></p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-700">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(kcal / macroTotal) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-1.5">
          {(["maintain", "cut", "gain"] as CalorieGoal[]).map(g => (
            <button key={g} onClick={() => changeGoal(g)}
              className={`min-h-[44px] flex-1 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                goal === g ? "bg-brand-500 text-white" : "bg-surface-700/60 text-surface-400 hover:text-surface-200"
              }`}>
              {GOAL_LABEL[g]}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-xl bg-surface-700/30 p-3">
          {tip ? (
            <p className="text-sm leading-relaxed text-surface-300">{tip}</p>
          ) : (
            <button onClick={loadTip} disabled={tipLoading} className="flex min-h-[44px] w-full items-center justify-center gap-2 text-sm text-brand-400 hover:text-brand-300">
              {tipLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Pensando…</> : <><Sparkles className="w-4 h-4" /> O que comer hoje, pelo treino do dia</>}
            </button>
          )}
        </div>
      </div>

      <Disclosure
        title="Combustível para longão e prova"
        icon={<Flame className="w-4 h-4" />}
        summary="Carboidrato, géis e água por hora"
      >
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-surface-300">Duração</span>
            <span className="text-sm font-bold tabular-nums text-surface-100">
              {Math.floor(fuelMin / 60)}h{(fuelMin % 60).toString().padStart(2, "0")}
            </span>
          </div>
          <input type="range" min={30} max={300} step={15} value={fuelMin}
            onChange={e => setFuelMin(Number(e.target.value))} className="h-1.5 w-full accent-brand-500" />
          {fuel.needsFuel ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[["Carbo/h", `${fuel.carbsPerHourG}`, "g"], ["Géis", `${fuel.gels}`, "un"], ["Água", `${fuel.waterMl}`, "ml"]].map(([l, v, u]) => (
                <div key={l} className="rounded-xl bg-surface-700/30 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">{l}</p>
                  <p className="text-lg font-black tabular-nums text-surface-100">{v}<span className="text-xs text-surface-500"> {u}</span></p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-surface-500">
              <Droplets className="w-3.5 h-3.5" /> Abaixo de 75 min, só água resolve.
            </p>
          )}
          <p className="mt-2 text-[10px] text-surface-500">Estimativas — não substituem acompanhamento de nutricionista.</p>
        </div>
      </Disclosure>
    </div>
  );
}
