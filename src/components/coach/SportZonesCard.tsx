"use client";

import { useEffect, useState } from "react";
import { Activity, Info } from "lucide-react";
import { SPORTS, isPrimarySport, type SportKey, type PrimarySport } from "@/lib/sports";
import {
  zonesForSport, swimPaceTargets, LTHR_OFFSET, BIKE_EFFORT_NOTE,
} from "@/lib/sport-metrics";

interface Props {
  /** Running LTHR from the 3 km test — the anchor all sports are derived from. */
  runningLthr: number | null;
  /** Running threshold pace (sec/km), used to seed a swim CSS estimate. */
  thresholdPaceSecKm?: number | null;
}

const ZONE_COLORS = [
  "bg-surface-500", "bg-green-500", "bg-yellow-500", "bg-amber-500", "bg-red-500",
];

/**
 * Heart-rate zones per sport. Running zones don't transfer directly to the bike
 * or the pool — same athlete, different maximal heart rates — so each sport gets
 * its own bands derived from the running LTHR.
 */
export function SportZonesCard({ runningLthr, thresholdPaceSecKm }: Props) {
  const [sports, setSports] = useState<SportKey[] | null>(null);
  const [active, setActive] = useState<SportKey>("ciclismo");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/sports")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.sports) return;
        // Only the sports that have zones. The practiced list now carries tier-2
        // entries too, and `zonesForSport` has nothing to say about yoga.
        const list = (d.sports as SportKey[])
          .filter(s => isPrimarySport(s) && s !== "musculacao");
        setSports(list);
        // Prefer a non-running sport — running already has its own card.
        setActive(list.find(s => s !== "corrida") ?? list[0] ?? "corrida");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Nothing to add if the athlete only runs, or there's no test yet.
  if (!sports || sports.length === 0) return null;
  const others = sports.filter(s => s !== "corrida");
  if (others.length === 0) return null;
  if (!runningLthr) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Activity className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Zonas por esporte</h2>
        </div>
        <p className="text-sm text-surface-500">
          Registre um teste de 3 km com frequência cardíaca para calcular as zonas de
          {" "}{others.map(s => SPORTS[s].label.toLowerCase()).join(" e ")}.
        </p>
      </div>
    );
  }

  const zones = zonesForSport(runningLthr, active);
  const offset = LTHR_OFFSET[active as PrimarySport] ?? 0;

  // Rough CSS seed: swimming threshold ≈ running threshold pace × 0.55 per 100 m.
  const cssSeconds = thresholdPaceSecKm ? Math.round(thresholdPaceSecKm * 0.55) : null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-brand-400" />
        <h2 className="section-title">Zonas por esporte</h2>
      </div>

      {/* Sport switcher */}
      <div className="flex gap-1 bg-surface-700 rounded-lg p-1">
        {sports.map(s => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className={`flex-1 min-h-[44px] py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors duration-100 ${
              active === s ? "bg-brand-500 text-white" : "text-surface-400 hover:text-surface-200"
            }`}
          >
            <span className="mr-1" aria-hidden>{SPORTS[s].emoji}</span>{SPORTS[s].label}
          </button>
        ))}
      </div>

      {offset !== 0 && (
        <p className="text-[11px] text-surface-500 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-surface-500" />
          FC de limiar {Math.abs(offset)} bpm abaixo da corrida — normal neste esporte
          (peso apoiado{active === "natacao" ? ", posição horizontal e reflexo de mergulho" : " e menor massa muscular recrutada"}).
        </p>
      )}

      {/* Zones */}
      <div className="space-y-1.5">
        {zones.map((z, i) => (
          <div key={z.zone} className="flex items-center gap-2.5">
            <span className={`w-1.5 h-8 rounded-full shrink-0 ${ZONE_COLORS[i]}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-surface-200">Z{z.zone} · {z.name}</p>
              <p className="text-[10px] text-surface-500 truncate">{z.focus}</p>
            </div>
            <span className="font-mono text-xs font-bold text-surface-300 shrink-0 tabular-nums">
              {z.min}–{z.max}
            </span>
          </div>
        ))}
      </div>

      {/* Swim pace targets */}
      {active === "natacao" && cssSeconds && (
        <div className="pt-2 border-t border-surface-700/50">
          <p className="stat-label mb-2">Ritmos por 100 m (estimados)</p>
          <div className="space-y-1.5">
            {swimPaceTargets(cssSeconds).map(t => (
              <div key={t.name} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-surface-300">{t.name}</p>
                  <p className="text-[10px] text-surface-500 truncate">{t.focus}</p>
                </div>
                <span className="font-mono text-xs font-bold text-brand-300 shrink-0">{t.range}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-surface-500 mt-2">
            Estimativa a partir do seu limiar de corrida. Faça um teste de 400 m + 200 m para calibrar o CSS real.
          </p>
        </div>
      )}

      {active === "ciclismo" && (
        <p className="text-[10px] text-surface-500 pt-2 border-t border-surface-700/50">{BIKE_EFFORT_NOTE}</p>
      )}
    </div>
  );
}
