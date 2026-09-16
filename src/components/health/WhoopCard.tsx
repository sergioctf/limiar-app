"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, Loader2, Check, AlertCircle, RefreshCw, Link2Off } from "lucide-react";

interface Status {
  configured: boolean;
  connected:  boolean;
  lastSync?:  string | null;
}

/** What each redirect flag from the OAuth callback means, in plain Portuguese. */
const CALLBACK_MESSAGE: Record<string, { text: string; ok: boolean }> = {
  conectado:        { text: "Whoop conectada.", ok: true },
  recusado:         { text: "Você recusou o acesso na Whoop.", ok: false },
  "estado-invalido": { text: "A volta da Whoop não conferiu. Tente conectar de novo.", ok: false },
  "falha-na-troca": { text: "A Whoop recusou a troca do código. Tente de novo.", ok: false },
  "erro-ao-salvar": { text: "Conectou, mas não consegui salvar. Tente de novo.", ok: false },
  "sem-sessao":     { text: "Sua sessão expirou durante a conexão.", ok: false },
};

/**
 * Whoop — the shortest path to real recovery data.
 *
 * Strava says what the athlete did. Whoop says what state they were in before
 * doing it, which is the input the readiness score was written for and has
 * never had.
 */
export function WhoopCard() {
  const params = useSearchParams();
  const flag = params.get("whoop");

  const [status, setStatus]   = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult]   = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/whoop/sync");
      setStatus(r.ok ? await r.json() : { configured: false, connected: false });
    } catch {
      setStatus({ configured: false, connected: false });
    }
  }

  useEffect(() => { void load(); }, []);

  // Landing back from the callback with a connection means there is data
  // waiting; pulling it immediately saves the athlete a second tap and makes
  // the connection prove itself right away.
  useEffect(() => {
    if (flag === "conectado" && status?.connected) void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag, status?.connected]);

  async function sync() {
    setSyncing(true);
    setResult(null);
    try {
      const r = await fetch("/api/whoop/sync", { method: "POST" });
      const d = await r.json();
      setResult(r.ok
        ? (d.saved > 0 ? `${d.saved} dia${d.saved > 1 ? "s" : ""} importado${d.saved > 1 ? "s" : ""}.` : "Nada novo.")
        : (d.error ?? "Falha na sincronização."));
      if (r.ok) await load();
    } catch {
      setResult("Falha na conexão.");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setSyncing(true);
    try {
      await fetch("/api/whoop/sync", { method: "DELETE" });
      setResult(null);
      await load();
    } finally {
      setSyncing(false);
    }
  }

  if (!status) {
    return (
      <div className="card p-5 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Verificando Whoop…
      </div>
    );
  }

  const callback = flag ? CALLBACK_MESSAGE[flag] : null;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
          <Activity className="w-5 h-5 text-red-400" />
        </div>
        <div className="min-w-0">
          <h2 className="section-title">Whoop</h2>
          <p className="text-xs text-surface-500">Recuperação, sono e FC de repouso, todo dia</p>
        </div>
      </div>

      {callback && (
        <p className={`text-sm flex items-start gap-1.5 ${callback.ok ? "text-green-400" : "text-yellow-400"}`}>
          {callback.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          {callback.text}
        </p>
      )}

      {!status.configured ? (
        <p className="text-sm text-surface-500 leading-relaxed">
          Integração ainda não configurada no servidor. Falta registrar o app em
          {" "}<span className="text-surface-400">developer.whoop.com</span> e definir
          {" "}<code className="text-[11px] text-surface-400">WHOOP_CLIENT_ID</code> e
          {" "}<code className="text-[11px] text-surface-400">WHOOP_CLIENT_SECRET</code>.
        </p>
      ) : status.connected ? (
        <>
          <p className="text-sm text-green-400 flex items-center gap-1.5">
            <Check className="w-4 h-4 shrink-0" /> Conectada
            {status.lastSync && (
              <span className="text-surface-500 font-normal">
                · última sincronização {new Date(status.lastSync).toLocaleDateString("pt-BR")}
              </span>
            )}
          </p>
          {result && <p className="text-xs text-surface-400">{result}</p>}
          <div className="flex gap-2">
            <button onClick={sync} disabled={syncing} className="btn-secondary flex-1">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar agora
            </button>
            <button
              onClick={disconnect}
              disabled={syncing}
              className="btn-ghost text-surface-500 hover:text-red-400"
              aria-label="Desconectar Whoop"
            >
              <Link2Off className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-surface-500 leading-relaxed">
            Desconectar não apaga o que já foi importado — esse histórico é seu e a
            prontidão dos dias passados continua fazendo sentido.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-surface-500 leading-relaxed">
            Conecte uma vez e a prontidão passa a usar recuperação, HRV e sono medidos —
            em vez de estimar só pela carga de treino.
          </p>
          <a href="/api/whoop/authorize" className="btn-primary w-full">
            <Activity className="w-4 h-4" /> Conectar Whoop
          </a>
        </>
      )}
    </div>
  );
}
