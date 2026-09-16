"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CONTEXTS, EFFORTS, evaluateRunFeedback, pickFeedbackItem, type FeedbackItem, type RunContext } from "@/lib/run-feedback";
import { athleteDaysAgoStr } from "@/lib/week";

export function RunFeedbackCard({ runId, refreshKey = "" }: { runId?: string; refreshKey?: string }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/run-feedback${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => null);
        // The feature can be unavailable in an environment where the migration
        // has not run yet. Hiding it beats putting an error above the session.
        if (response.status === 503) { setItems([]); return; }
        if (!response.ok || !Array.isArray(data?.items)) throw new Error(data?.error || "Não foi possível carregar seu check-in. Confira sua conexão e se você está conectado à conta.");
        setItems(data.items);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof TypeError ? "Sem conexão com o check-in. Tente novamente." : e instanceof Error ? e.message : "Falha ao carregar."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [runId, refreshKey, retry]);
  if (loading) return <div className="card p-4 text-sm text-surface-400" role="status">Carregando seu feedback pós-treino…</div>;
  if (error) return <div className="card p-4 text-sm"><p role="alert">{error}</p><button type="button" className="text-brand-400 min-h-[44px]" onClick={() => setRetry(n => n + 1)}>Tentar novamente</button></div>;
  const item = pickFeedbackItem(items, { runId, selectedId, since: athleteDaysAgoStr(1) });
  if (!item) return null;
  const pending = !runId && items.find(i => i.run.id !== item.run.id && !i.feedback);
  return <div className="space-y-2"><FeedbackForm key={`${item.run.id}:${item.feedback?.status ?? "new"}`} item={item} onSaved={feedback => {
    setSelectedId(feedback?.status === "answered" ? item.run.id : null);
    setItems(current => current.map(i => i.run.id === item.run.id ? { ...i, feedback } : i));
  }} />{pending && item.feedback?.status === "answered" && <button type="button" className="text-sm text-brand-400 min-h-[44px]" onClick={() => setSelectedId(pending.run.id)}>Responder sobre outro treino recente</button>}</div>;
}

function FeedbackForm({ item, onSaved }: { item: FeedbackItem; onSaved: (feedback: FeedbackItem["feedback"]) => void }) {
  const [effort, setEffort] = useState<number | null>(item.feedback?.effort ?? null);
  const [context, setContext] = useState<RunContext | null>(item.feedback?.context ?? null);
  const [note, setNote] = useState(item.feedback?.note ?? "");
  const [editing, setEditing] = useState(!item.feedback || item.feedback.status === "skipped");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const assessment = evaluateRunFeedback(item);
  async function save(status: "answered" | "skipped") {
    if (busy || (status === "answered" && (!effort || !context))) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/run-feedback", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: item.run.id, status, effort, context, note }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.feedback) throw new Error(data?.error || "Não foi possível salvar. Confira sua conexão e se você está conectado à conta. Suas respostas continuam aqui.");
      onSaved(data.feedback); setEditing(false);
    } catch (e) { setError(e instanceof TypeError ? "Sem conexão. Suas respostas continuam aqui; tente salvar novamente." : e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente."); }
    finally { setBusy(false); }
  }
  const choice = "rounded-xl border px-3 py-2 min-h-[44px] text-sm transition-colors ";
  return <section className="card p-4 sm:p-5 space-y-4" aria-label="Feedback pós-treino">
    <div><p className="text-xs text-brand-400 font-semibold">SEU TREINADOR · PÓS-TREINO</p>
      <h2 className="font-semibold mt-1">{editing ? "Como foi para você?" : assessment.title}</h2>
      <Link className="text-sm text-surface-400 underline" href={`/runs/${item.run.id}`}>{item.run.name} · {item.run.date.split("-").reverse().join("/")}</Link>
      <p className="text-sm text-surface-400 mt-1">{item.run.distance_km.toFixed(1)} km{item.run.avg_hr ? ` · FC média ${item.run.avg_hr} bpm` : ""}</p>
    </div>
    {editing ? <>
      <p className="text-sm text-surface-400">Duas respostas rápidas. Os números já estão registrados; falta sua percepção.</p>
      <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-medium mb-2">Como esse treino pareceu para você?</legend>
        <div className="flex flex-wrap gap-2">{EFFORTS.map((label, i) => <button key={label} type="button" aria-pressed={effort === i + 1} onClick={() => setEffort(i + 1)} className={choice + (effort === i + 1 ? "border-brand-400 bg-brand-500/15" : "border-surface-600")}>{label}</button>)}</div>
      </fieldset>
      <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-medium mb-2">Teve algo que precisamos considerar?</legend>
        <div className="flex flex-wrap gap-2">{(Object.entries(CONTEXTS) as [RunContext, string][]).map(([key, label]) => <button key={key} type="button" aria-pressed={context === key} onClick={() => setContext(key)} className={choice + (context === key ? "border-brand-400 bg-brand-500/15" : "border-surface-600")}>{label}</button>)}</div>
      </fieldset>
      {context === "pain" || context === "other" ? <label className="block text-sm">{context === "pain" ? "Onde sentiu o incômodo? (opcional)" : "Quer contar um pouco mais? (opcional)"}<textarea className="input mt-2 w-full" maxLength={300} rows={2} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /></label> : <details><summary className="text-sm cursor-pointer">Adicionar observação (opcional)</summary><label className="block text-sm mt-2">Sua observação<textarea className="input mt-2 w-full" maxLength={300} rows={2} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /></label></details>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !effort || !context} onClick={() => save("answered")} className="rounded-xl bg-brand-500 text-white px-4 min-h-[44px] disabled:opacity-50">{busy ? "Salvando…" : "Ver feedback"}</button>
        <button type="button" disabled={busy} className="text-sm text-surface-400 min-h-[44px]" onClick={() => save("skipped")}>Pular este check-in</button></div>
    </> : <div aria-live="polite" className="space-y-3 text-sm">
      {assessment.evidence.map(text => <p key={text}>{text}</p>)}
      {item.feedback?.note && <p className="text-surface-400">Sua observação: {item.feedback.note}</p>}
      <p className="rounded-xl bg-brand-500/10 p-3">{assessment.next}</p>
      <button type="button" className="text-brand-400 min-h-[44px]" onClick={() => setEditing(true)}>Editar respostas</button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </section>;
}
