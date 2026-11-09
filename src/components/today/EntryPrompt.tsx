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
 * At most one prompt per visit. Before a session the coach's own question
 * comes first (18/09 — it only matters before the run), then the last run's
 * check-in, then the week. Two dialogs back to back is the nagging this replaces.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { promptCandidate, type FeedbackItem } from "@/lib/run-feedback";
import { athleteDaysAgoStr } from "@/lib/week";
import { RunFeedbackForm } from "@/components/runs/RunFeedbackForm";
import { ActivityFeedbackForm } from "@/components/debrief/ActivityFeedback";
import { activityDebriefCandidate, type ActivityFeedbackItem } from "@/lib/activity-feedback";
import { X } from "lucide-react";
import { WeekQuestionBody, fetchWeekQuestion, type WeekQuestionPayload } from "@/components/today/WeekQuestionCard";
import { TodayCheckBody, fetchTodayCheck, type TodayCheckPayload } from "@/components/today/TodayCheck";

/** A run asks for its check-in while it is still fresh: today, yesterday or the day before. */
const FRESH_DAYS = 2;
const laterKey = (weekStart: string) => `limiar:week-question-later:${weekStart}`;

type Prompt =
  | { kind: "today"; payload: TodayCheckPayload }
  | { kind: "run"; item: FeedbackItem }
  | { kind: "activity"; item: ActivityFeedbackItem }
  | { kind: "week"; payload: WeekQuestionPayload };

export function EntryPrompt({ refreshKey = "" }: { refreshKey?: string }) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [answered, setAnswered] = useState(false);
  const [lightened, setLightened] = useState<string[]>([]);
  // One prompt per visit. Set when a prompt opens, so a run imported mid-visit
  // (the Strava sync refreshes the page) can still be asked about if nothing was.
  const shown = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (shown.current) return;
    const controller = new AbortController();
    (async () => {
      try {
        // Once a day, and only while unanswered: afterwards it lives on the Hoje card.
        const today = await fetchTodayCheck(controller.signal).catch(() => null);
        if (today?.check.action === "ask" && !today.answer && !today.prompted) {
          shown.current = true;
          setPrompt({ kind: "today", payload: today });
          void fetch("/api/coach/today-check", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "prompted" }),
          }).catch(() => {});
          return;
        }

        const read = async (path: string) => {
          const response = await fetch(path, { cache: "no-store", signal: controller.signal });
          const body = response.ok ? await response.json() : null;
          return Array.isArray(body?.items) ? body.items : [];
        };
        const [runs, activities] = await Promise.all([
          read("/api/run-feedback").catch(() => []),
          read("/api/activity-feedback").catch(() => []),
        ]);
        if (controller.signal.aborted) return;
        const since = athleteDaysAgoStr(FRESH_DAYS);
        const run = promptCandidate(runs, since);
        const activity = activityDebriefCandidate(activities, since);
        if (activity && (!run || activity.activity.date > run.run.date)) {
          shown.current = true;
          setPrompt({ kind: "activity", item: activity });
          return;
        }
        if (run) { shown.current = true; setPrompt({ kind: "run", item: run }); return; }

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
    // The coach's question stays on the Hoje card; closing the pop-up is enough.
    if (current.kind === "today") return;
    if (current.kind === "week") {
      try { if (current.payload.weekStart) localStorage.setItem(laterKey(current.payload.weekStart), "1"); } catch { /* sem storage */ }
      return;
    }
    const run = current.kind === "run";
    const target = run ? { runId: current.item.run.id } : { activityId: current.item.activity.id };
    await fetch(run ? "/api/run-feedback" : "/api/activity-feedback", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...target, status }),
    }).catch(() => {});
  }, [prompt, close]);
  const later = useCallback(() => putAside("deferred"), [putAside]);

  // Dismissing an unanswered prompt means "later"; after an answer it just closes.
  const dismiss = useCallback(() => { if (answered) close(); else void later(); }, [answered, close, later]);

  const isOpen = prompt != null;
  useEffect(() => {
    if (!isOpen) return;
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, [isOpen]);

  if (!prompt) return null;

  return (
    <dialog
      ref={dialog}
      aria-label={prompt.kind === "today" ? "Pergunta antes do treino" : prompt.kind === "week" ? "Pergunta sobre a semana passada" : "Limiar Debrief"}
      onCancel={event => { event.preventDefault(); dismiss(); }}
      className="limiar-entry-dialog w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-surface-700 bg-surface-900 text-surface-300 p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="limiar-kicker">{prompt.kind === "today" || prompt.kind === "week" ? "Treinador" : "Pós-treino"}</span>
          <button type="button" aria-label="Fechar" onClick={dismiss} className="btn-ghost !p-2 min-w-[44px]">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {prompt.kind === "today" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-surface-100">Antes do treino</h2>
            <TodayCheckBody
              payload={prompt.payload}
              onLater={() => void later()}
              onAnswered={() => setAnswered(true)}
            />
            {answered && (
              <button type="button" onClick={close} className="btn-primary w-full">Fechar</button>
            )}
          </div>
        ) : prompt.kind === "run" ? (
          <RunFeedbackForm
            key={prompt.item.run.id}
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
        ) : prompt.kind === "activity" ? (
          <ActivityFeedbackForm
            key={prompt.item.activity.id}
            item={prompt.item}
            onLater={() => void later()}
            onNever={() => void putAside("skipped")}
            onClose={close}
            onSaved={feedback => {
              setAnswered(true);
              setPrompt(current => current?.kind === "activity" ? { kind: "activity", item: { ...current.item, feedback } } : current);
            }}
          />
        ) : (
          <WeekQuestionBody payload={prompt.payload} onLater={() => void later()} onClose={close} />
        )}
    </dialog>
  );
}
