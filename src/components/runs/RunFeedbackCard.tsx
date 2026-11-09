"use client";

/**
 * The check-in on a run's own page.
 *
 * This is where "Responder depois" leads: the pop-up never comes back for a
 * postponed run, so its page is the one place that always offers the form (or,
 * once answered, the assessment and the option to edit it).
 */
import { useEffect, useState } from "react";
import type { FeedbackItem } from "@/lib/run-feedback";
import { RunFeedbackForm } from "@/components/runs/RunFeedbackForm";

export function RunFeedbackCard({ runId }: { runId: string }) {
  const [item, setItem] = useState<FeedbackItem | null>(null);
  const [lightened, setLightened] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/run-feedback?runId=${encodeURIComponent(runId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => null);
        // The feature can be unavailable where the migration has not run: stay out of the way.
        if (response.status === 503) { setItem(null); return; }
        if (!response.ok || !Array.isArray(data?.items)) throw new Error(data?.error || "Não foi possível carregar o check-in.");
        setItem(data.items[0] ?? null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e instanceof TypeError ? "Sem conexão com o check-in." : e instanceof Error ? e.message : "Falha ao carregar.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [runId, retry]);

  if (loading) return <div className="card p-4 text-sm text-surface-400" role="status">Carregando seu check-in…</div>;
  if (error) {
    return (
      <div className="card p-4 text-sm">
        <p role="alert">{error}</p>
        <button type="button" className="text-brand-400 min-h-[44px]" onClick={() => setRetry(n => n + 1)}>Tentar novamente</button>
      </div>
    );
  }
  if (!item) return null;

  return (
    <section className="card p-4 sm:p-5" aria-label="Seu feedback do treino">
      <RunFeedbackForm
        key={item.run.id}
        item={item}
        lightened={lightened}
        onSaved={({ feedback, lightened: changed }) => {
          setItem(current => current ? { ...current, feedback } : current);
          setLightened(changed);
        }}
      />
    </section>
  );
}
