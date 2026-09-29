"use client";

/**
 * "Você realizou o teste de 3 km hoje?"
 *
 * A pergunta aparece no check-in do treino, no dia marcado — porque é o único
 * momento em que ela tem resposta certa e custo zero: a pessoa acabou de
 * correr e está com o telefone na mão.
 *
 * As duas saídas são úteis. **Fiz** leva ao formulário que recalibra o plano;
 * **não fiz** remarca para outro dia, em vez de deixar o teste morrer marcado
 * numa data que já passou — e o check-in do treino segue normalmente, sobre o
 * que foi feito de verdade.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { ScheduleTestSheet } from "@/components/coach/ScheduleTestSheet";
import type { PlannedTest } from "@/lib/planned-test";

export function TestDayQuestion({ runDate }: { runDate: string }) {
  const router = useRouter();
  const [test, setTest] = useState<PlannedTest | null>(null);
  const [answered, setAnswered] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/planned-test", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setTest((d?.test as PlannedTest | null) ?? null); })
      .catch(() => { /* sem marcação, sem pergunta */ });
    return () => { cancelled = true; };
  }, []);

  if (!test || test.date !== runDate || answered) {
    return rescheduling ? (
      <ScheduleTestSheet
        current={test}
        onClose={() => setRescheduling(false)}
        onSaved={t => { setTest(t); setAnswered(true); }}
      />
    ) : null;
  }

  async function done() {
    setBusy(true);
    try {
      await fetch("/api/coach/planned-test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
    } catch { /* o formulário é o que importa */ }
    router.push("/coach/calibracao");
  }

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-300">
        <FlaskConical className="h-3.5 w-3.5" /> Teste marcado para hoje
      </p>
      <p className="mt-1 text-sm font-semibold text-surface-100">
        Você realizou o teste de {test.distanceKm} km hoje?
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={done} disabled={busy} className="btn-primary min-h-[44px] px-4 text-sm">
          Fiz — registrar o tempo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRescheduling(true)}
          className="btn-ghost min-h-[44px] px-4 text-sm"
        >
          Não fiz — remarcar
        </button>
      </div>
    </div>
  );
}
