"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, X, Smartphone, ChevronRight } from "lucide-react";

const SNOOZE_KEY = "limiar_push_nudge_snoozed_until";
/** Dismissing snoozes the prompt rather than killing it — the daily plan,
 *  overtraining alerts and readiness suggestions are all inert without push. */
const SNOOZE_DAYS = 7;

type Status = "checking" | "hidden" | "can-subscribe" | "ios-install" | "blocked";

/**
 * Prompts the athlete to turn on notifications — the daily plan, overtraining
 * alerts and readiness suggestions all depend on a push subscription existing.
 * Hidden once dismissed or once a subscription is in place.
 */
export function NotificationNudge() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (snoozedUntil > Date.now()) { setStatus("hidden"); return; }

    const ua  = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    // iOS only allows push from an installed (home-screen) PWA.
    if (ios && !standalone) { setStatus("ios-install"); return; }

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("hidden");
      return;
    }

    // Permission already refused: subscribing will fail, so point at the fix
    // instead of offering a button that can't work.
    if (Notification.permission === "denied") { setStatus("blocked"); return; }

    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setStatus(sub ? "hidden" : "can-subscribe"))
      .catch(() => setStatus("can-subscribe"));
  }, []);

  function dismiss() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400_000));
    setStatus("hidden");
  }

  if (status === "checking" || status === "hidden") return null;

  const COPY: Record<"ios-install" | "can-subscribe" | "blocked", {
    title: string; body: string; cta: string;
  }> = {
    "ios-install": {
      title: "Instale o Limiar na tela de início",
      body:  "No iPhone, o treino do dia e os alertas só chegam com o app instalado. Leva menos de 30 segundos.",
      cta:   "Ver como instalar",
    },
    "can-subscribe": {
      title: "Ative as notificações",
      body:  "Com elas você recebe o treino do dia às 5h30, o de amanhã à noite, alertas de overtraining e ajustes de plano. Sem elas, o app não te avisa de nada.",
      cta:   "Ativar agora",
    },
    blocked: {
      title: "Notificações bloqueadas",
      body:  "Você negou a permissão neste dispositivo. Reative nos ajustes do navegador (ou do iPhone) para voltar a receber o treino do dia e os alertas.",
      cta:   "Como reativar",
    },
  };

  const copy = COPY[status];
  const isIos = status === "ios-install";

  return (
    <div className="card p-4 border-brand-500/20 bg-brand-500/5 relative">
      <button
        onClick={dismiss}
        aria-label="Lembrar depois"
        title="Lembrar depois"
        className="absolute top-3 right-3 text-surface-500 hover:text-surface-300 p-1"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
          {isIos ? <Smartphone className="w-4.5 h-4.5 text-brand-400" />
            : status === "blocked" ? <BellOff className="w-4.5 h-4.5 text-yellow-400" />
            : <Bell className="w-4.5 h-4.5 text-brand-400" />}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-surface-100 text-sm">{copy.title}</p>
          <p className="text-xs text-surface-400 mt-0.5 leading-relaxed">{copy.body}</p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300 mt-2"
          >
            {copy.cta} <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
