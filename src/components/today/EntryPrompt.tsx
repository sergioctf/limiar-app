"use client";

/**
 * What the coach asks when the athlete opens the app — as a pop-up, once.
 *
 * Sérgio, 16/09: the check-in parked on top of the dashboard until answered was
 * visual clutter. It is a moment, not a fixture: you finish a run, open the app,
 * and the coach asks how it went. Answer now, "Responder depois" (it comes back
 * on a later visit while the run is fresh) or "Não quero responder" (it does
 * not come back). The run's own page keeps the form either way.
 *
 * At most one prompt per visit, run first. Two dialogs back to back is the
 * nagging this replaces.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { promptCandidate, type FeedbackItem } from "@/lib/run-feedback";
import { athleteDaysAgoStr } from "@/lib/week";
import { RunFeedbackForm } from "@/components/runs/RunFeedbackForm";
import { WeekQuestionBody, fetchWeekQuestion, type WeekQuestionPayload } from "@/components/today/WeekQuestionCard";

/** A run asks for its check-in while it is still fresh: today, yesterday or the day before. */
const FRESH_DAYS = 2;
const laterKey = (weekStart: string) => `limiar:week-question-later:${weekStart}`;

type Prompt =
  | { kind: "run"; item: FeedbackItem }
  | { kind: "week"; payload: WeekQuestionPayload };

export function EntryPrompt({ refreshKey = "" }: { refreshKey?: string }) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [answered, setAnswered] = useState(false);
  const [lightened, setLightened] = useState<string[]>([]);
  // One prompt per visit. Set when a prompt opens, so a run imported mid-visit
  // (the Strava sync refreshes the page) can still be asked about if nothing was.
  const shown = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown.current) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/run-feedback", { cache: "no-store", signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        const item = Array.isArray(data?.items) ? promptCandidate(data.items, athleteDaysAgoStr(FRESH_DAYS)) : null;
        if (item) { shown.current = true; setPrompt({ kind: "run", item }); return; }

        const payload = await fetchWeekQuestion(controller.signal);
        if (payload?.question && payload.weekStart) {
          let later = false;
          try { later = localStorage.getItem(laterKey(payload.weekStart)) === "1"; } catch { /* sem storage */ }
          if (!later) { shown.current = true; setPrompt({ kind: "week", payload }); }
        }
      } catch {
        // A prompt is a nudge: if it cannot load, the app simply opens.
      }
    })();
    return () => controller.abort();
  }, [refreshKey]);

  const close = useCallback(() => { setPrompt(null); setAnswered(false); setLightened([]); }, []);

  /**
   * "Responder depois" and "Não quero responder" are different answers.
   *
   * Both used to be stored as `skipped`, so "later" in practice meant "never":
   * the pop-up did not come back. Now `deferred` returns after a few hours while
   * the run is still fresh, and only the explicit refusal is `skipped`.
   */
  const putAside = useCallback(async (status: "deferred" | "skipped") => {
    const current = prompt;
    close();
    if (!current) return;
    if (current.kind === "week") {
      try { if (current.payload.weekStart) localStorage.setItem(laterKey(current.payload.weekStart), "1"); } catch { /* sem storage */ }
      return;
    }
    await fetch("/api/run-feedback", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: current.item.run.id, status }),
    }).catch(() => {});
  }, [prompt, close]);
  const later = useCallback(() => putAside("deferred"), [putAside]);

  // Dismissing an unanswered prompt means "later"; after an answer it just closes.
  const dismiss = useCallback(() => { if (answered) close(); else void later(); }, [answered, close, later]);

  useEffect(() => {
    if (!prompt) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [prompt, dismiss]);

  if (!prompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={dismiss}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={prompt.kind === "run" ? "Check-in pós-treino" : "Pergunta sobre a semana passada"}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-surface-700 bg-surface-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up outline-none"
      >
        {prompt.kind === "run" ? (
          <RunFeedbackForm
            key={`${prompt.item.run.id}:${prompt.item.feedback?.status ?? "new"}`}
            item={prompt.item}
            lightened={lightened}
            onLater={() => void later()}
            onNever={() => void putAside("skipped")}
            onClose={close}
            onSaved={({ feedback, lightened: changed }) => {
              setAnswered(true);
              setLightened(changed);
              setPrompt(current => current?.kind === "run" ? { kind: "run", item: { ...current.item, feedback } } : current);
            }}
          />
        ) : (
          <WeekQuestionBody payload={prompt.payload} onLater={() => void later()} onClose={close} />
        )}
      </div>
    </div>
  );
}
