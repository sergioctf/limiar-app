"use client";

import { useState, useEffect } from "react";
import { Download, Share, X, Smartphone, CheckCircle2 } from "lucide-react";

// Chrome/Android deferred install prompt
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "android" | "ios" | "desktop" | "installed" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent;
  // Already installed as PWA
  if (window.matchMedia("(display-mode: standalone)").matches) return "installed";
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return "installed";
  // iOS
  if (/iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)) return "ios";
  // Android
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function InstallPWAButton() {
  const [platform,     setPlatform]     = useState<Platform>("unknown");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installed,    setInstalled]    = useState(false);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    if (p === "installed") setInstalled(true);

    // Capture the Chrome/Android install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Detect when the app gets installed
    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  async function handleAndroidInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setInstallEvent(null);
    }
  }

  if (platform === "unknown") return null;

  if (installed) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-400">
        <CheckCircle2 className="w-4 h-4" />
        App instalado na tela inicial ✓
      </div>
    );
  }

  // ── Android Chrome: native prompt available ───────────────────────────────
  if (platform === "android" && installEvent) {
    return (
      <button onClick={handleAndroidInstall} className="btn-primary flex items-center gap-2">
        <Download className="w-4 h-4" />
        Instalar app (Android)
      </button>
    );
  }

  // ── iOS Safari: manual guide ──────────────────────────────────────────────
  if (platform === "ios") {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Smartphone className="w-4 h-4" />
          Como instalar no iPhone / iPad
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="card w-full max-w-sm p-5 space-y-4 relative">
              <button
                onClick={() => setShowIOSGuide(false)}
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
                  <p className="text-xs text-surface-500">3 passos rápidos</p>
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
                    <p className="text-sm font-medium text-surface-200">Role e toque em</p>
                    <p className="text-xs text-surface-400 mt-0.5 font-medium">"Adicionar à Tela de Início"</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Toque em "Adicionar"</p>
                    <p className="text-xs text-surface-500 mt-0.5">O app Limiar aparece na sua tela inicial</p>
                  </div>
                </li>
              </ol>

              <p className="text-xs text-surface-600 text-center pt-1">
                Funciona apenas no Safari — não no Chrome do iPhone
              </p>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="btn-primary w-full"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Desktop / Android without prompt yet ─────────────────────────────────
  return (
    <p className="text-sm text-surface-500 flex items-center gap-2">
      <Download className="w-4 h-4" />
      {platform === "desktop"
        ? "No Chrome desktop: clique no ícone de instalar (⊕) na barra de endereço"
        : "Abra no Chrome do celular e aguarde o banner de instalação aparecer"}
    </p>
  );
}
