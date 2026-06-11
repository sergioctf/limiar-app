"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2, Check, Smartphone, Share, X } from "lucide-react";

type PermState = "default" | "granted" | "denied" | "unsupported" | "loading" | "ios-not-installed";

/** Detect iOS Safari (not Chrome/Firefox on iOS) outside of standalone mode */
function detectContext(): "ios-browser" | "ios-standalone" | "other" {
  if (typeof window === "undefined") return "other";
  const ua  = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
  if (!ios) return "other";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "ios-standalone" : "ios-browser";
}

/** Convert base64url VAPID public key → Uint8Array */
function urlB64ToUint8Array(raw: string): Uint8Array {
  const cleaned = raw.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
  const rawData = window.atob(cleaned + padding);
  const out     = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export function PushNotificationButton() {
  const [state,      setState]   = useState<PermState>("loading");
  const [subscribed, setSub]     = useState(false);
  const [error,      setError]   = useState<string | null>(null);
  const [iosGuide,   setIosGuide] = useState(false);
  const [debugInfo,  setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    const ctx = detectContext();

    // iOS Safari in browser (not standalone) → push not available, guide to install
    if (ctx === "ios-browser") {
      setState("ios-not-installed");
      return;
    }

    // Generic check
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      const missing = [];
      if (!("Notification" in window)) missing.push("Notification API");
      if (!("serviceWorker" in navigator)) missing.push("Service Worker");
      if (!("PushManager" in window)) missing.push("PushManager");
      setDebugInfo(`Missing: ${missing.join(", ")}`);
      setState("unsupported");
      return;
    }

    setState(Notification.permission as PermState);
    navigator.serviceWorker.ready
      .then(reg => {
        console.log("[Push] Service Worker ready:", reg);
        return reg.pushManager.getSubscription();
      })
      .then(sub => {
        setSub(!!sub);
        if (sub) console.log("[Push] Already subscribed to:", sub.endpoint);
      })
      .catch(err => {
        console.error("[Push] Setup error:", err);
        setDebugInfo(`SW error: ${err.message}`);
      });
  }, []);

  async function handleEnable() {
    setError(null);
    setDebugInfo(null);
    setState("loading");
    try {
      console.log("[Push] Requesting permission...");
      const permission = await Notification.requestPermission();
      console.log("[Push] Permission result:", permission);
      if (permission !== "granted") { setState("denied"); setDebugInfo(`Permission: ${permission}`); return; }

      console.log("[Push] Registering SW & subscribing...");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const vapidKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
      console.log("[Push] VAPID key length:", vapidKey.length);
      if (!vapidKey) throw new Error("Chave VAPID não configurada");

      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlB64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
        });

        const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        console.log("[Push] Subscribed:", subJson.endpoint.slice(0, 50) + "...");

        const res = await fetch("/api/push/subscribe", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(`Save failed: ${data.error || res.status}`);
        }

        console.log("[Push] Success!");
        setState("granted");
        setSub(true);
      } catch (subscribeErr) {
        console.error("[Push] Subscribe/save error:", subscribeErr);
        throw subscribeErr;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao ativar notificações";
      console.error("[Push] Final error:", msg);
      setError(msg);
      setDebugInfo(msg);
      setState((Notification.permission ?? "default") as PermState);
    }
  }

  async function handleDisable() {
    setError(null);
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/push/subscribe", {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ endpoint }),
        });
      }
      setSub(false);
      setState((Notification.permission ?? "default") as PermState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desativar");
      setState((Notification.permission ?? "default") as PermState);
    }
  }

  /* ── iOS not installed ─────────────────────────────────────────────────── */
  if (state === "ios-not-installed") {
    return (
      <>
        <div className="space-y-3">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
            <p className="text-sm text-yellow-300 font-semibold mb-1">Instale o app primeiro</p>
            <p className="text-xs text-surface-400 leading-relaxed">
              No iPhone, notificações push só funcionam quando o Limiar está instalado
              na tela inicial. É rápido: menos de 30 segundos.
            </p>
          </div>
          <button
            onClick={() => setIosGuide(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Smartphone className="w-4 h-4" />
            Como instalar no iPhone
          </button>
          <p className="text-xs text-surface-600">
            Após instalar, abra o app pela tela inicial e ative as notificações aqui.
          </p>
        </div>

        {/* iOS install modal */}
        {iosGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="card w-full max-w-sm p-5 space-y-4 relative">
              <button
                onClick={() => setIosGuide(false)}
                className="absolute top-4 right-4 text-surface-500 hover:text-surface-300"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="font-bold text-surface-100">Instalar no iPhone</h3>
                  <p className="text-xs text-surface-500">3 passos · menos de 30s</p>
                </div>
              </div>

              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Toque no ícone de compartilhar</p>
                    <p className="text-xs text-surface-500 flex items-center gap-1 mt-0.5">
                      Ícone <Share className="w-3.5 h-3.5 inline" /> na barra inferior do Safari
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Role para baixo e toque em</p>
                    <p className="text-xs text-brand-300 mt-0.5 font-semibold">"Adicionar à Tela de Início"</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Toque em "Adicionar"</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Abra o app pelo ícone na tela inicial, vá em Configurações e ative as notificações
                    </p>
                  </div>
                </li>
              </ol>

              <p className="text-[11px] text-surface-600 text-center">
                Funciona apenas no Safari · não no Chrome do iPhone
              </p>

              <button onClick={() => setIosGuide(false)} className="btn-primary w-full">
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ── Generic unsupported ───────────────────────────────────────────────── */
  if (state === "unsupported") {
    return (
      <div className="flex items-center gap-2 text-sm text-surface-500">
        <BellOff className="w-4 h-4" />
        Notificações push não suportadas neste navegador
      </div>
    );
  }

  /* ── Permission denied ─────────────────────────────────────────────────── */
  if (state === "denied") {
    return (
      <div className="text-sm text-yellow-400 flex items-center gap-2">
        <BellOff className="w-4 h-4" />
        Permissão negada — habilite notificações nas configurações do navegador
      </div>
    );
  }

  /* ── Active / subscribe ────────────────────────────────────────────────── */
  return (
    <div className="space-y-2">
      {subscribed && state !== "loading" ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check className="w-4 h-4" />
            <span>Notificações ativas — 05:30h e 22:00h (BRT)</span>
          </div>
          <button
            onClick={handleDisable}
            disabled={(state as string) === "loading"}
            className="text-xs text-surface-500 hover:text-red-400 transition-colors px-2 py-1 rounded"
          >
            Desativar
          </button>
        </div>
      ) : (
        <button
          onClick={handleEnable}
          disabled={state === "loading"}
          className="btn-primary flex items-center gap-2"
        >
          {state === "loading" ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Ativando…</>
          ) : (
            <><Bell className="w-4 h-4" />Ativar notificações push</>
          )}
        </button>
      )}
      {error && (
        <div className="text-xs text-red-400 space-y-1">
          <p>{error}</p>
          {debugInfo && <p className="text-[10px] text-red-300 opacity-70">{debugInfo}</p>}
          <p className="text-red-500 opacity-50">💡 Abra o console (F12) para mais detalhes</p>
        </div>
      )}
      <p className="text-xs text-surface-600">
        Receba o treino do dia às 05:30h e o treino de amanhã às 22:00h direto no celular.
      </p>
    </div>
  );
}

// ── Service Worker auto-registration ─────────────────────────────────────────
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(err =>
      console.warn("[SW] Registration failed:", err)
    );
  }, []);
  return null;
}
