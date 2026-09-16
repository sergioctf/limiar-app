"use client";

/**
 * "Your Garmin says something else?" — the optional number.
 *
 * Small on purpose, and below the answer rather than in it: the Limiar score is
 * the default reading. Typing the Garmin's Training Readiness adds one more
 * signal to it and gives us the reference to calibrate against; leaving it empty
 * costs nothing.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function GarminReadinessField({ value }: { value: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(next: number | null) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/health/garmin-readiness", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível salvar.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n > 100) { setError("Informe um número de 1 a 100."); return; }
    void send(n);
  }

  if (value != null && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-surface-700 bg-surface-800 px-4 py-3 text-sm">
        <span className="text-surface-300">
          Disposição do Garmin hoje: <strong className="tabular-nums text-surface-100">{value}</strong>
          <span className="text-surface-500"> · entra no score como mais um sinal</span>
        </span>
        <span className="flex gap-3">
          <button type="button" className="min-h-[44px] text-brand-400" onClick={() => { setDraft(String(value)); setEditing(true); }}>Editar</button>
          <button type="button" className="min-h-[44px] text-surface-400" disabled={busy} onClick={() => send(null)}>Remover</button>
        </span>
      </div>
    );
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className="w-full min-h-[44px] rounded-2xl border border-dashed border-surface-700 px-4 py-3 text-left text-sm text-surface-400 hover:border-surface-500">
        Seu Garmin mostra outra disposição? Informe o número (opcional)
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-surface-700 bg-surface-800 px-4 py-3">
      <label className="block text-sm text-surface-300" htmlFor="garmin-readiness">
        Disposição (Training Readiness) que o Garmin mostra hoje
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="garmin-readiness" type="number" inputMode="numeric" min={1} max={100}
          value={draft} onChange={e => setDraft(e.target.value)} disabled={busy}
          className="input w-24 tabular-nums" />
        <button type="button" onClick={save} disabled={busy}
          className="min-h-[44px] rounded-xl bg-brand-500 px-4 text-sm text-white disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => { setEditing(false); setError(""); }} disabled={busy}
          className="min-h-[44px] text-sm text-surface-400">
          Cancelar
        </button>
      </div>
      <p className="text-xs text-surface-500">Opcional. O Limiar calcula a disposição sozinho; este número entra como mais um sinal.</p>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
