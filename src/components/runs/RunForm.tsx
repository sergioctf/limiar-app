"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, AlignLeft, Sliders } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  timeStringToSeconds, calcPace
} from "@/lib/utils";

const RUN_TYPES = [
  { value: "easy", label: "Leve" },
  { value: "long_run", label: "Longão" },
  { value: "tempo", label: "Tempo/Ritmo" },
  { value: "intervals", label: "Tiros" },
  { value: "race", label: "Prova" },
  { value: "recovery", label: "Regenerativo" },
  { value: "steady", label: "Steady" },
  { value: "progression", label: "Progressivo" },
  { value: "other", label: "Outro" },
];

interface Props {
  userId: string;
  runId?: string;          // when provided → edit mode (UPDATE)
  initial?: Record<string, unknown>;
}

export function RunForm({ userId, runId, initial }: Props) {
  const isEdit = Boolean(runId);
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"structured" | "freetext">("structured");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");

  // Structured fields
  const [name, setName]               = useState((initial?.name as string) ?? "");
  const [date, setDate]               = useState((initial?.date as string) ?? new Date().toISOString().split("T")[0]);
  const [type, setType]               = useState((initial?.type as string) ?? "easy");
  const [distance, setDistance]       = useState(initial?.distance_km != null ? String(initial.distance_km) : "");
  // Pre-fill time from duration_seconds if editing
  const initialTime = (() => {
    const sec = initial?.duration_seconds as number | undefined;
    if (!sec) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  })();
  const [time, setTime]               = useState(initialTime);  // hh:mm:ss or mm:ss
  const [avgHr, setAvgHr]             = useState(initial?.avg_hr != null ? String(initial.avg_hr) : "");
  const [maxHr, setMaxHr]             = useState(initial?.max_hr != null ? String(initial.max_hr) : "");
  const [elevation, setElevation]     = useState(initial?.elevation_gain_m != null ? String(initial.elevation_gain_m) : "");
  const [conditions, setConditions]   = useState((initial?.conditions as string) ?? "");
  const [effort, setEffort]           = useState(initial?.perceived_effort != null ? String(initial.perceived_effort) : "");
  const [hydration, setHydration]     = useState((initial?.hydration as string) ?? "");
  const [gelUsage, setGelUsage]       = useState((initial?.gel_usage as string) ?? "");
  const [notes, setNotes]             = useState((initial?.notes as string) ?? "");
  const [coachFeedback, setCoachFeedback] = useState((initial?.coach_feedback as string) ?? "");
  const [tags, setTags]               = useState((initial?.tags as string) ?? "");
  const [relevance, setRelevance]     = useState(initial?.relevance != null ? String(initial.relevance) : "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let payload: Record<string, unknown>;

      if (mode === "freetext") {
        payload = {
          user_id: userId,
          // Preserve source in edit mode; default to "manual" for new runs
          ...(isEdit ? {} : { source: "manual" }),
          name: "Corrida manual",
          date: new Date().toISOString().split("T")[0],
          type: "other",
          distance_km: 0,
          duration_seconds: 0,
          raw_text: freeText,
          notes: freeText,
        };
      } else {
        const durationSec = timeStringToSeconds(time);
        const distKm = parseFloat(String(distance)) || 0;
        const avgPace = distKm > 0 && durationSec > 0 ? Math.round(calcPace(distKm, durationSec)) : null;

        payload = {
          user_id: userId,
          // Preserve source in edit mode; default to "manual" for new runs
          ...(isEdit ? {} : { source: "manual" }),
          name: name || `Corrida ${date}`,
          date,
          type,
          distance_km: distKm,
          duration_seconds: durationSec,
          avg_pace_seconds_per_km: avgPace,
          avg_hr: avgHr ? parseInt(avgHr) : null,
          max_hr: maxHr ? parseInt(maxHr) : null,
          elevation_gain_m: elevation ? parseFloat(String(elevation)) : null,
          conditions: conditions || null,
          perceived_effort: effort ? parseInt(effort) : null,
          hydration: hydration || null,
          gel_usage: gelUsage || null,
          notes: notes || null,
          coach_feedback: coachFeedback || null,
          relevance: relevance ? parseInt(relevance) : null,
        };
      }

      let savedRunId: string;

      if (isEdit && runId) {
        // UPDATE
        const { error: updateError } = await supabase
          .from("runs")
          .update(payload)
          .eq("id", runId)
          .eq("user_id", userId);
        if (updateError) throw updateError;
        savedRunId = runId;

        // Replace tags: delete existing, re-insert
        await supabase.from("run_tags").delete().eq("run_id", runId);
        if (tags.trim()) {
          const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
          if (tagList.length > 0) {
            await supabase.from("run_tags").insert(
              tagList.map((tag) => ({ run_id: runId, tag }))
            );
          }
        }
      } else {
        // INSERT
        const { data: run, error: insertError } = await supabase
          .from("runs")
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;
        savedRunId = run?.id ?? "";

        // Save tags
        if (tags.trim() && run) {
          const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
          await supabase.from("run_tags").insert(
            tagList.map((tag) => ({ run_id: run.id, tag }))
          );
        }
      }

      router.push(savedRunId ? `/runs/${savedRunId}` : "/runs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar corrida");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={isEdit && runId ? `/runs/${runId}` : "/runs"} className="btn-ghost">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="page-header">{isEdit ? "Editar corrida" : "Nova corrida"}</h1>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-surface-700 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setMode("structured")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "structured"
              ? "bg-brand-500 text-white shadow"
              : "text-surface-400 hover:text-surface-200"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> Estruturado
        </button>
        <button
          type="button"
          onClick={() => setMode("freetext")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "freetext"
              ? "bg-brand-500 text-white shadow"
              : "text-surface-400 hover:text-surface-200"
          }`}
        >
          <AlignLeft className="w-3.5 h-3.5" /> Texto livre
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "freetext" ? (
          <div className="card p-5">
            <label className="label">Cole o resumo do treino, análise do treinador, ou relato pós-corrida</label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Cole aqui o output do treinador de IA, descrição da corrida, dados do Garmin, etc..."
              rows={12}
              className="input resize-none font-mono text-xs"
            />
            <p className="text-xs text-surface-500 mt-2">
              O texto será salvo na íntegra. Você poderá editar os campos individualmente depois.
            </p>
          </div>
        ) : (
          <>
            <div className="card p-5 space-y-4">
              <h2 className="section-title">Dados básicos</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Nome da atividade</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Longão de domingo" className="input" />
                </div>
                <div>
                  <label className="label">Data</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    required className="input" />
                </div>
                <div>
                  <label className="label">Tipo</label>
                  <select value={type} onChange={(e) => setType(e.target.value)} className="input">
                    {RUN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Distância (km)</label>
                  <input type="number" step="0.01" value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    placeholder="8.00" required className="input" />
                </div>
                <div>
                  <label className="label">Tempo (mm:ss ou hh:mm:ss)</label>
                  <input type="text" value={time} onChange={(e) => setTime(e.target.value)}
                    placeholder="44:42" className="input font-mono" />
                </div>
              </div>
            </div>

            <div className="card p-5 space-y-4">
              <h2 className="section-title">Métricas</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">FC média (bpm)</label>
                  <input type="number" value={avgHr} onChange={(e) => setAvgHr(e.target.value)}
                    placeholder="166" className="input" />
                </div>
                <div>
                  <label className="label">FC máxima (bpm)</label>
                  <input type="number" value={maxHr} onChange={(e) => setMaxHr(e.target.value)}
                    placeholder="182" className="input" />
                </div>
                <div>
                  <label className="label">Altimetria (m)</label>
                  <input type="number" step="0.1" value={elevation}
                    onChange={(e) => setElevation(e.target.value)}
                    placeholder="30" className="input" />
                </div>
                <div>
                  <label className="label">Percepção de esforço (1–10)</label>
                  <input type="number" min="1" max="10" value={effort}
                    onChange={(e) => setEffort(e.target.value)}
                    placeholder="7" className="input" />
                </div>
                <div>
                  <label className="label">Condições</label>
                  <input type="text" value={conditions} onChange={(e) => setConditions(e.target.value)}
                    placeholder="SP, calor, manhã" className="input" />
                </div>
                <div>
                  <label className="label">Relevância (1–10)</label>
                  <input type="number" min="1" max="10" value={relevance}
                    onChange={(e) => setRelevance(e.target.value)}
                    placeholder="8" className="input" />
                </div>
              </div>
            </div>

            <div className="card p-5 space-y-4">
              <h2 className="section-title">Nutrição e contexto</h2>
              <div>
                <label className="label">Hidratação</label>
                <input type="text" value={hydration} onChange={(e) => setHydration(e.target.value)}
                  placeholder="Água + isotônico no km 10" className="input" />
              </div>
              <div>
                <label className="label">Uso de gel</label>
                <input type="text" value={gelUsage} onChange={(e) => setGelUsage(e.target.value)}
                  placeholder="Gel 1: 30 min, Gel 2: 1h05" className="input" />
              </div>
              <div>
                <label className="label">Tags (separadas por vírgula)</label>
                <input type="text" value={tags} onChange={(e) => setTags(e.target.value)}
                  placeholder="prova, placa, chuva" className="input" />
              </div>
            </div>

            <div className="card p-5 space-y-4">
              <h2 className="section-title">Anotações</h2>
              <div>
                <label className="label">Notas do treino</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Como foi o treino, sensações, contexto..."
                  rows={4} className="input resize-none" />
              </div>
              <div>
                <label className="label">Análise do treinador (IA)</label>
                <textarea value={coachFeedback} onChange={(e) => setCoachFeedback(e.target.value)}
                  placeholder="Cole aqui a análise do seu treinador de IA..."
                  rows={5} className="input resize-none" />
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-4 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          <Link href="/runs" className="btn-secondary flex-1 justify-center">
            Cancelar
          </Link>
          <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? "Salvar alterações" : "Salvar corrida"}
          </button>
        </div>
      </form>
    </div>
  );
}
