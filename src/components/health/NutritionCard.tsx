"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Utensils, Flame, Loader2, Check, Sparkles, Droplets } from "lucide-react";
import { fuelingPlan, type Sex, type CalorieGoal, type Macros } from "@/lib/nutrition";

export interface NutritionSummary {
  complete: boolean;
  goal: CalorieGoal;
  heightCm: number | null;
  sex: Sex | null;
  birthDate: string | null;
  weightKg: number | null;
  age: number | null;
  trainingKcal: number;
  bmr?: number;
  tdee?: number;
  target?: number;
  macros?: Macros;
}

const GOAL_LABEL: Record<CalorieGoal, string> = { maintain: "Manter", cut: "Perder gordura", gain: "Ganhar massa" };

export function NutritionCard({ data }: { data: NutritionSummary }) {
  const router = useRouter();

  // Profile form state (when incomplete)
  const [height, setHeight] = useState(data.heightCm?.toString() ?? "");
  const [sex, setSex] = useState<Sex | "">(data.sex ?? "");
  const [birth, setBirth] = useState(data.birthDate ?? "");
  const [goal, setGoal] = useState<CalorieGoal>(data.goal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI tip
  const [tip, setTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);

  // Fueling calculator
  const [fuelMin, setFuelMin] = useState(90);
  const fuel = fuelingPlan(fuelMin, "easy");

  async function saveProfile() {
    if (!height || !sex || !birth) { setError("Preencha altura, sexo e nascimento"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/health/nutrition-profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ height_cm: parseFloat(height.replace(",", ".")), sex, birth_date: birth, calorie_goal: goal }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Falha"); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally { setSaving(false); }
  }

  async function changeGoal(g: CalorieGoal) {
    setGoal(g);
    await fetch("/api/health/nutrition-profile", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calorie_goal: g }),
    });
    router.refresh();
  }

  async function loadTip() {
    setTipLoading(true); setTip(null);
    try {
      const res = await fetch("/api/health/diet-tip");
      const d = await res.json();
      setTip(res.ok ? d.tip : (d.error ?? "Não foi possível gerar a dica."));
    } catch {
      setTip("Erro ao gerar a dica.");
    } finally { setTipLoading(false); }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Utensils className="w-4 h-4 text-brand-400" />
        <h2 className="section-title">Nutrição</h2>
      </div>

      {!data.complete ? (
        /* Setup form */
        <div className="space-y-3">
          <p className="text-sm text-surface-500">
            Para calcular sua taxa metabólica e meta calórica, precisamos de alguns dados
            {!data.weightKg && <> (e do seu <strong className="text-surface-300">peso</strong>, registrado acima)</>}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-surface-500">Altura (cm)</span>
              <input type="text" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="175"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500 mt-0.5" />
            </label>
            <label className="block">
              <span className="text-[11px] text-surface-500">Nascimento</span>
              <input type="date" value={birth} onChange={e => setBirth(e.target.value)}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500 mt-0.5" />
            </label>
          </div>
          <div className="flex gap-2">
            {(["M", "F"] as Sex[]).map(s => (
              <button key={s} onClick={() => setSex(s)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${sex === s ? "bg-brand-500 text-white" : "bg-surface-700 text-surface-400"}`}>
                {s === "M" ? "Masculino" : "Feminino"}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={saveProfile} disabled={saving} className="btn-primary w-full justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : "Calcular minha meta"}
          </button>
        </div>
      ) : (
        <>
          {/* Calorie summary */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Metab. basal" value={`${data.bmr}`} unit="kcal" />
            <Stat label="Gasto treino" value={`${Math.round(data.trainingKcal)}`} unit="kcal" accent />
            <Stat label="Meta do dia" value={`${data.target}`} unit="kcal" big />
          </div>

          {/* Macros */}
          {data.macros && (
            <div className="flex gap-2">
              <Macro label="Carbo" g={data.macros.carbs_g} color="text-brand-300" />
              <Macro label="Proteína" g={data.macros.protein_g} color="text-blue-300" />
              <Macro label="Gordura" g={data.macros.fat_g} color="text-yellow-300" />
            </div>
          )}

          {/* Goal selector */}
          <div>
            <p className="text-[11px] text-surface-500 mb-1.5">Objetivo</p>
            <div className="flex gap-1.5">
              {(["maintain", "cut", "gain"] as CalorieGoal[]).map(g => (
                <button key={g} onClick={() => changeGoal(g)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${goal === g ? "bg-brand-500 text-white" : "bg-surface-700 text-surface-400 hover:text-surface-200"}`}>
                  {GOAL_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          {/* AI tip */}
          <div className="bg-surface-700/30 rounded-xl p-3">
            {tip ? (
              <p className="text-sm text-surface-300 leading-relaxed">{tip}</p>
            ) : (
              <button onClick={loadTip} disabled={tipLoading} className="w-full flex items-center justify-center gap-2 text-sm text-brand-400 hover:text-brand-300 py-1">
                {tipLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Pensando…</> : <><Sparkles className="w-4 h-4" /> Dica de nutrição para hoje</>}
              </button>
            )}
          </div>

          {/* Fueling calculator */}
          <div className="pt-2 border-t border-surface-700/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-surface-200 flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-400" /> Fueling do longão/prova</p>
              <span className="text-xs text-surface-400 tabular-nums">{Math.floor(fuelMin / 60)}h{(fuelMin % 60).toString().padStart(2, "0")}</span>
            </div>
            <input type="range" min={30} max={300} step={15} value={fuelMin} onChange={e => setFuelMin(Number(e.target.value))} className="w-full accent-brand-500 h-1.5" />
            {fuel.needsFuel ? (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Stat label="Carbo/h" value={`${fuel.carbsPerHourG}`} unit="g" />
                <Stat label="Géis (~25g)" value={`${fuel.gels}`} unit="un" accent />
                <Stat label="Água" value={`${fuel.waterMl}`} unit="ml" />
              </div>
            ) : (
              <p className="text-xs text-surface-500 mt-2 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5" /> Abaixo de 75 min: só água é suficiente.
              </p>
            )}
          </div>

          <p className="text-[10px] text-surface-600">Estimativas — não substituem acompanhamento de nutricionista.</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit, accent, big }: { label: string; value: string; unit: string; accent?: boolean; big?: boolean }) {
  return (
    <div className="bg-surface-700/30 rounded-lg p-2.5 text-center">
      <p className="text-[10px] text-surface-500 uppercase tracking-wide">{label}</p>
      <p className={`font-black tabular-nums ${big ? "text-xl text-brand-400" : accent ? "text-base text-orange-300" : "text-base text-surface-100"}`}>{value}</p>
      <p className="text-[9px] text-surface-600">{unit}</p>
    </div>
  );
}

function Macro({ label, g, color }: { label: string; g: number; color: string }) {
  return (
    <div className="flex-1 bg-surface-700/30 rounded-lg p-2 text-center">
      <p className={`text-sm font-bold tabular-nums ${color}`}>{g}g</p>
      <p className="text-[10px] text-surface-500">{label}</p>
    </div>
  );
}
