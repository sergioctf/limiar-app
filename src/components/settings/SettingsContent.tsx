"use client";

import { useState } from "react";
import {
  Activity, CheckCircle2, XCircle, RefreshCw, Link2, Link2Off,
  User, LogOut, Clock, Check, AlertCircle, Loader2
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SyncLog } from "@/types";

interface StravaConn {
  athlete_id: number;
  scope: string;
  updated_at: string;
}

interface Props {
  userEmail: string;
  userName: string;
  stravaConnection: StravaConn | null;
  syncLogs: SyncLog[];
  stravaRunsCount: number;
}

export function SettingsContent({
  userEmail, userName, stravaConnection, syncLogs, stravaRunsCount
}: Props) {
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; updated: number; ignored: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const supabase = createClient();

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSyncResult(data);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar o Strava? Os dados já importados serão mantidos.")) return;
    setDisconnecting(true);
    await fetch("/api/strava/disconnect", { method: "POST" });
    window.location.reload();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in">
      <h1 className="page-header">Configurações</h1>

      {/* Profile */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-surface-700 flex items-center justify-center">
            <User className="w-4.5 h-4.5 text-surface-400" />
          </div>
          <h2 className="section-title">Conta</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-surface-500">Nome</span>
            <span className="text-surface-200">{userName || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-surface-500">Email</span>
            <span className="text-surface-200">{userEmail}</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn-ghost mt-4 text-red-400 hover:bg-red-400/10"
        >
          <LogOut className="w-4 h-4" /> Sair da conta
        </button>
      </div>

      {/* Strava integration */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Activity className="w-4.5 h-4.5 text-orange-400" />
          </div>
          <div>
            <h2 className="section-title">Integração Strava</h2>
            <p className="text-xs text-surface-500">Importação automática de corridas</p>
          </div>
        </div>

        {stravaConnection ? (
          <div className="space-y-4">
            {/* Status */}
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-green-400">Conectado</span>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-surface-500">Atleta ID</span>
                  <span className="text-surface-300 font-mono">{stravaConnection.athlete_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-surface-500">Último sync</span>
                  <span className="text-surface-300">
                    {new Date(stravaConnection.updated_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-surface-500">Corridas importadas</span>
                  <span className="text-surface-300 font-bold">{stravaRunsCount}</span>
                </div>
              </div>
            </div>

            {/* Sync result */}
            {syncResult && (
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Check className="w-4 h-4 text-brand-400" />
                  <span className="text-sm font-semibold text-brand-400">Sync concluído</span>
                </div>
                <div className="flex gap-4 text-xs text-surface-400">
                  <span>+{syncResult.imported} novas</span>
                  <span>{syncResult.updated} atualizadas</span>
                  <span>{syncResult.ignored} ignoradas</span>
                </div>
              </div>
            )}

            {syncError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400">{syncError}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="btn-primary flex-1 justify-center"
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {syncing ? "Sincronizando..." : "Sincronizar agora"}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="btn-secondary"
              >
                <Link2Off className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-surface-500" />
                <span className="text-sm text-surface-400">Strava não conectado</span>
              </div>
              <p className="text-xs text-surface-500 leading-relaxed">
                Conecte sua conta do Strava para importar automaticamente suas corridas com todos os dados de GPS, pace, FC e altimetria.
              </p>
            </div>
            <a href="/api/strava/connect" className="btn-primary w-full justify-center">
              <Link2 className="w-4 h-4" />
              Conectar Strava
            </a>
          </div>
        )}
      </div>

      {/* Sync logs */}
      {syncLogs.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-surface-500" />
            <h2 className="section-title">Histórico de sincronização</h2>
          </div>
          <div className="space-y-2">
            {syncLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                {log.status === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-surface-300 line-clamp-2">{log.message}</p>
                  <p className="text-xs text-surface-600 mt-0.5">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Webhook status */}
      <div className="card p-4 border-green-500/20 bg-green-500/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-green-400">Webhook ativo</span>
        </div>
        <p className="text-xs text-surface-500 mt-1 leading-relaxed">
          Novas corridas no Strava aparecem aqui automaticamente, com análise IA gerada na hora.
        </p>
      </div>
    </div>
  );
}
