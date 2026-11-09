"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { Sheet, SheetActions, SheetOption } from "@/components/ui/Sheet";
import type { DoneItem, PlannedSession } from "@/lib/day-status";
import type { ActivityRef } from "@/lib/session-activity-link";

export function LinkActivityControl({ date, session, candidates }: {
  date: string;
  session: PlannedSession;
  candidates: DoneItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ActivityRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = candidates.filter(item => item.id);

  async function save(activity: ActivityRef | null) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/coach/session-activity", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, sport: session.sport, type: session.type, activity }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error ?? "Não foi possível atualizar o vínculo.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o vínculo.");
    } finally {
      setBusy(false);
    }
  }

  const close = useCallback(() => { if (!busy) setOpen(false); }, [busy]);
  if (!options.length) return null;

  return (
    <>
      <div className={session.unresolved ? "limiar-feature space-y-2 p-3" : ""}>
      {session.unresolved && (
        <p className="text-sm text-surface-300">
          {options.length > 1 ? "Há mais de um registro desta modalidade." : "O registro escolhido antes ficou indisponível."}
          {" "}Escolha qual atividade corresponde a {session.label.toLowerCase()}.
        </p>
      )}
      <button type="button" className={session.unresolved ? "btn-secondary w-full" : "btn-ghost"}
        onClick={() => { setChoice(null); setError(""); setOpen(true); }}>
        <Link2 className="h-4 w-4" aria-hidden /> {session.unresolved ? "Vincular atividade" : "Alterar vínculo"}
      </button>
      </div>
      {open && (
        <Sheet title="Vincular atividade" scope={session.label} onClose={close} busy={busy} error={error}
          footer={<SheetActions confirmLabel="Confirmar vínculo" onConfirm={() => { if (choice) void save(choice); }}
            onCancel={close} disabled={!choice} busy={busy} />}>
          {options.map((item, i) => {
            const id = item.id!;
            const detail = [
              item.km != null ? `${item.km.toLocaleString("pt-BR")} km` : null,
              item.minutes > 0 ? `${item.minutes} min` : null,
              item.planned ? "vínculo atual" : null,
            ].filter(Boolean).join(" · ");
            return (
              <div key={`${item.kind}:${id}`} className="space-y-1">
                <SheetOption label={item.recordName || item.label || `Atividade ${i + 1}`} detail={detail}
                  selected={choice?.id === id && choice.kind === item.kind} disabled={busy}
                  onClick={() => setChoice({ kind: item.kind, id })} />
                <a href={item.kind === "run" ? `/runs/${id}` : `/activities/${id}`} target="_blank" rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center px-2 text-xs text-brand-400">
                  Conferir registro {i + 1} em outra aba
                </a>
              </div>
            );
          })}
          {session.explicitlyLinked && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void save(null)}>Remover vínculo</button>}
        </Sheet>
      )}
    </>
  );
}
