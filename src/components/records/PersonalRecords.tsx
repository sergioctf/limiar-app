"use client";

import { useEffect, useState } from "react";
import { Timer, Loader2, TrendingUp, Info, Search } from "lucide-react";

/**
 * Personal records by distance.
 *
 * The thing that makes this different from a list of fast activities: the
 * record does not have to come from an activity of that distance. Sérgio's
 * best 10 km sits between km 10.2 and km 20.2 of a 21 km long run — nobody
 * would ever have found it by sorting activities.
 *
 * So the provenance line is not decoration. It is the feature: it tells you
 * *where* inside a run the effort happened, which is the only way to believe
 * a record you did not know you had set.
 */

interface Effort {
  seconds: number;
  paceSecPerKm: number;
  startM: number;
  endM: number;
  runId: string;
  runName: string;
  date: string;
  rank: number;
  pausedSec: number;
  fromActivityKm: number | null;
}

interface Record {
  distanceM: number;
  label: string;
  best: Effort | null;
  second: Effort | null;
  attempts: number;
}

const hms = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/km`;

const dataBr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

/** True when the effort was carved out of an activity of a different length. */
function veioDeOutraDistancia(e: Effort, distanceM: number): boolean {
  if (e.fromActivityKm == null) return false;
  return Math.abs(e.fromActivityKm * 1000 - distanceM) > 500;
}

export function PersonalRecords() {
  const [records, setRecords] = useState<Record[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [analysed, setAnalysed] = useState(0);
  const [total, setTotal] = useState(0);
  const [backfillable, setBackfillable] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const load = () =>
    fetch("/api/records")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        setRecords((d.records ?? []) as Record[]);
        setReason(d.reason ?? null);
        setAnalysed(d.activitiesAnalysed ?? 0);
        setTotal(d.activitiesTotal ?? 0);
        setBackfillable(d.backfillable ?? 0);
      });

  /*
   * Walk the rest of the history, a batch at a time.
   *
   * The loop lives here rather than in the route because Strava's rate limit is
   * 100 requests per 15 minutes shared across every user of the app — draining
   * hundreds of activities inside one request would either time out or burn the
   * budget for everybody. Batching also means the athlete watches the number
   * climb instead of staring at a spinner.
   */
  const scanHistory = async () => {
    setScanning(true);
    setScanNote(null);
    let feitas = 0;
    try {
      for (let volta = 0; volta < 40; volta++) {
        const r = await fetch("/api/records/backfill", { method: "POST" });
        if (!r.ok) break;
        const d = await r.json();
        feitas += d.processed ?? 0;
        setScanNote(`analisando… ${feitas} de ${feitas + (d.remaining ?? 0)}`);
        if (d.rateLimited) {
          setScanNote(`O Strava limitou por agora — ${feitas} corridas analisadas. Tente de novo em ~15 min.`);
          break;
        }
        if (d.reason === "no_connection") { setScanNote("Conecte o Strava para varrer o histórico."); break; }
        if (d.done || (d.processed ?? 0) === 0) { setScanNote(null); break; }
      }
      await load();
    } catch {
      setScanNote("Não consegui terminar a varredura. Tente de novo.");
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        setRecords((d?.records ?? []) as Record[]);
        setReason(d?.reason ?? null);
        setAnalysed(d?.activitiesAnalysed ?? 0);
        setTotal(d?.activitiesTotal ?? 0);
        setBackfillable(d?.backfillable ?? 0);
      })
      .catch(() => { if (!cancelled) setRecords([]); });
    return () => { cancelled = true; };
  }, []);

  if (!records) {
    return (
      <div className="card p-6 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Procurando seus melhores trechos…
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
          <Timer className="w-5 h-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-surface-100">Melhores esforços</h2>
          <p className="text-xs text-surface-500">
            O trecho mais rápido de cada distância, dentro de qualquer treino
          </p>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-6 space-y-2">
          <TrendingUp className="w-8 h-8 mx-auto text-surface-600 opacity-40" />
          <p className="text-sm text-surface-500">
            {reason === "unavailable"
              ? "Os recordes ainda não estão disponíveis."
              : "Nenhuma corrida longa o suficiente ainda."}
          </p>
          <p className="text-xs text-surface-600 max-w-xs mx-auto leading-relaxed">
            Os esforços são calculados quando você abre uma corrida e o app baixa
            os dados detalhados dela. Abra algumas corridas e volte aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {records.map(rec => {
              const b = rec.best;
              if (!b) return null;
              const dentro = veioDeOutraDistancia(b, rec.distanceM);
              return (
                <div
                  key={rec.distanceM}
                  className="rounded-xl bg-surface-800/40 border border-surface-700/40 px-3 py-2.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-surface-200 shrink-0">
                      {rec.label}
                    </span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {hms(b.seconds)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-3 mt-0.5">
                    <span className="text-[11px] text-surface-500 truncate">
                      {dataBr(b.date)} · {b.runName}
                    </span>
                    <span className="text-[11px] text-surface-500 tabular-nums shrink-0">
                      {pace(b.paceSecPerKm)}
                    </span>
                  </div>

                  {dentro && (
                    /* The point of the whole feature — say where it came from. */
                    <p className="text-[11px] text-brand-300/80 mt-1">
                      dentro de um treino de {b.fromActivityKm!.toFixed(1)} km,
                      entre os km {(b.startM / 1000).toFixed(1)} e {(b.endM / 1000).toFixed(1)}
                    </p>
                  )}

                  {b.pausedSec >= 30 && (
                    /* Measured on the race clock, so a long stop is already
                       inside the time — but seeing it explains a number that
                       would otherwise look inexplicably slow. */
                    <p className="text-[11px] text-surface-600 mt-1">
                      inclui {Math.floor(b.pausedSec / 60)}min{String(Math.round(b.pausedSec % 60)).padStart(2, "0")}s parado
                    </p>
                  )}

                  {rec.second && (
                    <p className="text-[11px] text-surface-600 mt-1">
                      2º melhor: {hms(rec.second.seconds)} · {dataBr(rec.second.date)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {backfillable > 0 && (
            /*
              Records are meant to cover a whole history. Presenting marks drawn
              from a fraction of it without saying so would let the athlete
              believe a partial answer is the real one.
            */
            <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 p-3 space-y-2">
              <p className="text-xs text-surface-300">
                {backfillable} {backfillable === 1 ? "corrida ainda não foi analisada" : "corridas ainda não foram analisadas"} —
                pode haver recorde escondido nelas.
              </p>
              <button
                onClick={scanHistory}
                disabled={scanning}
                className="btn-primary text-xs min-h-[44px]"
              >
                {scanning
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />Analisando…</>
                  : <><Search className="w-3.5 h-3.5 inline mr-1.5" />Analisar histórico completo</>}
              </button>
              {scanNote && <p className="text-[11px] text-surface-500">{scanNote}</p>}
            </div>
          )}

          <p className="text-[11px] text-surface-600 flex items-start gap-1.5 leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              Cronometrado pelo relógio da prova: uma parada no meio do trecho conta
              contra o tempo, como contaria numa corrida de rua.{" "}
              {analysed > 0 && (
                <>
                  Busca dentro de {analysed} {analysed === 1 ? "corrida" : "corridas"} com dados
                  detalhados
                  {total > analysed && <> e usa as outras {total - analysed} inteiras quando a
                  distância bate</>}. Abrir mais corridas amplia a busca.
                </>
              )}
              {analysed === 0 && total > 0 && (
                <>Usando corridas inteiras — abra uma corrida para o app baixar os dados
                detalhados e procurar trechos dentro dela.</>
              )}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
