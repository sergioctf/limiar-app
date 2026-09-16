"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Home, WifiOff } from "lucide-react";

interface Props {
  /** What failed, when we know. Next.js redacts the message in production. */
  error?: Error & { digest?: string };
  /** Re-render the failed segment. Absent on screens with nothing to retry. */
  reset?: () => void;
  title?: string;
  message?: string;
}

/**
 * The screen an athlete sees when something breaks.
 *
 * Three things it has to do, in order: say what happened without jargon, give a
 * way out that is not the browser's back button, and carry the digest so a
 * report of "deu erro" can be matched to a line in the logs.
 *
 * It also has to tell a crash apart from a tunnel. This app is a PWA people
 * open mid-run; the likeliest failure in the wild is a fetch that died because
 * the phone lost signal, and answering that with "erro inesperado" sends
 * someone hunting for a bug that is a subway ride.
 */
export function ErrorScreen({ error, reset, title, message }: Props) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Read on mount rather than during render: `navigator` does not exist on
    // the server, and reading it while rendering makes the markup disagree
    // with itself on hydration.
    const read = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  useEffect(() => {
    if (error) console.error("[limiar] erro na tela:", error);
  }, [error]);

  const heading = title ?? (offline ? "Você está sem conexão" : "Algo quebrou aqui");
  const body = message ?? (offline
    ? "Esta parte do app precisa de internet. O treino do dia e o plano da semana continuam disponíveis offline."
    : "Não foi culpa sua. O erro foi registrado — tente de novo e, se continuar, me avise.");

  return (
    <div className="min-h-screen flex items-center justify-center overlay-safe">
      <div className="card p-6 space-y-5 w-full max-w-sm">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            offline ? "bg-surface-700" : "bg-red-500/15"
          }`}>
            {offline
              ? <WifiOff className="w-5 h-5 text-surface-400" />
              : <AlertTriangle className="w-5 h-5 text-red-400" />}
          </div>
          <h1 className="font-bold text-surface-100 text-lg leading-tight">{heading}</h1>
        </div>

        <p className="text-sm text-surface-400 leading-relaxed">{body}</p>

        {/* In development the real message is worth more than a tidy screen. */}
        {process.env.NODE_ENV === "development" && error?.message && (
          <pre className="text-[11px] bg-surface-900 border border-surface-700 p-2.5 rounded-lg overflow-auto max-h-40 text-red-300 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}

        <div className="space-y-2">
          {reset && (
            <button onClick={reset} className="btn-primary w-full">
              <RefreshCw className="w-4 h-4" />
              Tentar de novo
            </button>
          )}
          <a href="/" className="btn-secondary w-full">
            <Home className="w-4 h-4" />
            Ir para o início
          </a>
        </div>

        {/* The only handle that survives production's redacted messages. */}
        {error?.digest && (
          <p className="text-[10px] text-surface-500 text-center font-mono">
            código do erro: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
