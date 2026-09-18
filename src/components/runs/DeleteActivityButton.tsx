"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/** Removes an activity from the history (soft delete, same as the calendar). Asks first. */
export function DeleteActivityButton({ id, backTo }: { id: string; backTo: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true); setError("");
    const response = await fetch(`/api/activities/${id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setBusy(false); setError("Não foi possível excluir."); return; }
    router.push(backTo);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-surface-500 hover:text-red-400">
        <Trash2 className="w-4 h-4" /> Excluir
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-3">
      <span className="text-sm text-surface-400">Excluir esta atividade?</span>
      <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-[44px] text-sm font-semibold text-red-400">
        {busy ? "Excluindo…" : "Excluir"}
      </button>
      <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-[44px] text-sm text-surface-400">Cancelar</button>
      {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
