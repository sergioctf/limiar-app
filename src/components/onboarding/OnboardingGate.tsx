"use client";

import { useEffect, useState } from "react";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { OnboardingQuestion } from "@/components/onboarding/OnboardingQuestions";
import { TOUR_STORAGE_KEY } from "@/components/onboarding/OnboardingTour";

/**
 * Decides whether to show the first-run flow, and remembers the answer.
 *
 * Kept apart from the flow itself so that "have I shown this?" lives in one
 * place. The old tour, the settings replay button and this gate all read and
 * write the same key — three copies of that rule is how a tutorial ends up
 * either never appearing or appearing forever.
 *
 * Two ways in: a brand-new account, or `?tour=1`, which is what the settings
 * button uses to replay it on demand.
 */
export function OnboardingGate({ isNewUser }: { isNewUser: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const forced = window.location.search.includes("tour=1");
    let seen = false;
    try { seen = !!localStorage.getItem(TOUR_STORAGE_KEY); } catch { /* sem storage */ }
    if (forced || (isNewUser && !seen)) setOpen(true);
  }, [isNewUser]);

  function finish() {
    try { localStorage.setItem(TOUR_STORAGE_KEY, "1"); } catch { /* sem storage */ }
    setOpen(false);
    // Drop ?tour=1 so a refresh does not reopen what was just dismissed.
    if (typeof window !== "undefined" && window.location.search.includes("tour=1")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  if (!open) return null;

  return (
    <OnboardingFlow
      onFinish={finish}
      renderQuestion={(step, next) =>
        step.field ? <OnboardingQuestion field={step.field} onSaved={next} /> : null}
    />
  );
}
