"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeviceAccount } from "@/components/layout/DeviceAccount";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { OnboardingQuestion } from "@/components/onboarding/OnboardingQuestions";
import { ONBOARDING_STEPS, TOUR_STEPS } from "@/lib/onboarding-flow";

export function OnboardingGate({ needsSetup }: { needsSetup: boolean }) {
  const userId = useDeviceAccount();
  const router = useRouter();
  const key = `limiar_setup:${userId}`;
  const [open, setOpen] = useState<null | "setup" | "tour">(null);
  const [initialStep, setInitialStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("tour") === "1") {
      setOpen("tour");
      return;
    }
    if (!needsSetup || !userId) return;
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isInteger(saved) && saved >= 0 && saved < ONBOARDING_STEPS.length) setInitialStep(saved);
    } catch { /* Storage may be unavailable. */ }
    if (query.has("strava_connected") || query.has("strava_error")) {
      setInitialStep(ONBOARDING_STEPS.findIndex(step => step.field === "strava"));
    }
    setOpen("setup");
  }, [key, needsSetup, userId]);

  function closeTour() {
    setOpen(null);
    router.replace("/");
  }

  async function finish(skip: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || result?.ok !== true) throw new Error(result?.error ?? "Não foi possível concluir. Tente novamente.");
      try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
      setOpen(null);
      const next = result.firstSession;
      window.location.replace(skip ? "/" : next ? `/coach?week=${encodeURIComponent(next.week)}&day=${encodeURIComponent(next.day)}` : "/coach");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  if (open === "tour") return <OnboardingFlow key="tour" steps={TOUR_STEPS} onFinish={closeTour} />;

  return (
    <OnboardingFlow
      key="setup"
      initialStep={initialStep}
      onStepChange={step => {
        const url = new URL(window.location.href);
        if (url.searchParams.has("strava_connected") || url.searchParams.has("strava_error")) {
          url.searchParams.delete("strava_connected");
          url.searchParams.delete("strava_error");
          window.history.replaceState(null, "", url);
        }
        try { localStorage.setItem(key, String(step)); } catch { /* Storage may be unavailable. */ }
      }}
      onFinish={() => void finish(false)}
      onDismiss={() => void finish(true)}
      busy={busy}
      error={error}
      renderQuestion={(step, next) => step.field ? <OnboardingQuestion field={step.field} onSaved={next} /> : null}
    />
  );
}
