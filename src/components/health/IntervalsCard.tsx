"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Watch, Loader2, Check, AlertCircle, RefreshCw, Link2Off, ExternalLink, KeyRound } from "lucide-react";
import { haptic } from "@/lib/haptics";

interface Status {
  available:     boolean;
  connected:     boolean;
  athleteName?:  string | null;
  lastSyncAt?:   string | null;
  lastError?:    string | null;
  daysReceived?: number;
}

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `em ${new Date(iso).toLocaleDateString("pt-BR")}`;
}

/**
 * Garmin, through intervals.icu.
 *
 * Garmin closed its own door to new apps in 2026. intervals.icu already had a
 * key to it, and lends it to the athlete: connect Garmin there once, paste a key
 * here once, and every night's HRV, resting heart rate and sleep arrive without
 * a shortcut, a button or a morning ritual.
 *
 * The setup is three steps in someone else's app, which is exactly where
 * integrations die — so each step names the screen and the words on it.
 */
export function IntervalsCard() {
  const router = useRouter();
  const [status, setStatus]   = useState<Status | null>(null);
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey]   = useState("");
  const [busy, setBusy]       = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const autoSynced = useRef(false);

  async function load() {
    try {
      const r = await fetch("/api/integrations/intervals");
      setStatus(r.ok ? await r.json() : { available: false, connected: false });
    } catch {
      setStatus({ available: false, connected: false });
    }
  }

  useEffect(() => { void load(); }, []);

  /*
   * Opening the screen is the sync. The server throttles it, so this costs
   * nothing when the data is fresh — and when last night has just landed, the
   * score on this very screen updates without the athlete pressing anything.
   */
  useEffect(() => {
    if (!status?.connected || autoSynced.current) return;
    autoSynced.current = true;
    fetch("/api/integrations/intervals/sync", { method: "POST" })
      .then(r => r.json())
      .then(d => { if (d.changed > 0) { void load(); router.refresh(); } })
      .catch(() => { /* the cron will catch up */ });
  }, [status?.connected, router]);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/integrations/intervals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, athleteId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMessage({ text: d.error ?? "Não foi possível conectar.", ok: false });
        haptic("warn");
        return;
      }
      // The key leaves the page's memory as soon as the server has it.
      setApiKey("");
      setMessage({
        text: d.syncError
          ? `Conectado${d.athleteName ? ` como ${d.athleteName}` : ""}, mas a primeira leitura falhou: ${d.syncError}`
          : d.saved > 0
            ? `Conectado${d.athleteName ? ` como ${d.athleteName}` : ""}. ${d.saved} ${d.saved === 1 ? "noite importada" : "noites importadas"}.`
            : `Conectado${d.athleteName ? ` como ${d.athleteName}` : ""}. Nenhuma noite ainda — confira se o Garmin está ligado no intervals.icu com Wellness e Sleep.`,
        ok: !d.syncError,
      });
      haptic("success");
      autoSynced.current = true;
      await load();
      router.refresh();
    } catch {
      setMessage({ text: "Falha na conexão.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/integrations/intervals/sync?force=1", { method: "POST" });
      const d = await r.json();
      setMessage(r.ok
        ? { text: d.changed > 0 ? `${d.changed} ${d.changed === 1 ? "dia atualizado" : "dias atualizados"}.` : "Tudo em dia — nada novo no Garmin.", ok: true }
        : { text: d.error ?? "Falha na sincronização.", ok: false });
      await load();
      if (r.ok && d.changed > 0) router.refresh();
    } catch {
      setMessage({ text: "Falha na conexão.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/integrations/intervals", { method: "DELETE" });
      setMessage(null);
      autoSynced.current = false;
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="card p-5 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Verificando Garmin…
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
          <Watch className="w-5 h-5 text-blue-400" />
        </div>
        <div className="min-w-0">
          <h2 className="section-title">Garmin</h2>
          <p className="text-xs text-surface-500">HRV, FC de repouso e sono, via intervals.icu</p>
        </div>
      </div>

      {message && (
        <p className={`text-sm flex items-start gap-1.5 ${message.ok ? "text-green-400" : "text-yellow-400"}`}>
          {message.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          {message.text}
        </p>
      )}

      {!status.available ? (
        <p className="text-sm text-surface-500 leading-relaxed">
          Falta uma atualização no banco de dados (migration 026) para esta conexão funcionar.
        </p>
      ) : status.connected ? (
        <>
          <p className="text-sm text-green-400 flex items-center gap-1.5 flex-wrap">
            <Check className="w-4 h-4 shrink-0" /> Conectado
            {status.athleteName && <span className="text-surface-400 font-normal">· {status.athleteName}</span>}
          </p>
          <p className="text-xs text-surface-500">
            {status.daysReceived ?? 0} {(status.daysReceived ?? 0) === 1 ? "noite recebida" : "noites recebidas"}
            {status.lastSyncAt && <> · última leitura {ago(status.lastSyncAt)}</>}
          </p>
          {status.lastError && !message && (
            <p className="text-xs text-yellow-400 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {status.lastError}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={syncNow} disabled={busy} className="btn-secondary flex-1">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar agora
            </button>
            <button
              onClick={disconnect}
              disabled={busy}
              className="btn-ghost text-surface-500 hover:text-red-400"
              aria-label="Desconectar Garmin"
            >
              <Link2Off className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-surface-500 leading-relaxed">
            Sincroniza sozinho quando você abre o app e toda manhã. A HRV passa a
            pesar na prontidão depois de 7 noites — ela é comparada com a sua própria média.
          </p>

          {/*
            A via de volta.

            O intervals.icu entrega a saúde do relógio para o app; por aqui o
            app devolve os treinos ao relógio. A chave fica junto da conexão
            porque é dela que depende — e ligada por padrão, porque conectar já
            é dizer "quero meus treinos no pulso" (Sérgio, 15/10).
          */}
          <SendToWatchToggle />
        </>
      ) : (
        <>
          <p className="text-sm text-surface-500 leading-relaxed">
            A Garmin pausou o acesso de apps novos à API dela. O intervals.icu é parceiro
            antigo e continua recebendo tudo — inclusive do CIRQA — então a ponte passa por ele.
          </p>

          <ol className="space-y-2.5">
            <Step n={1} title="Crie uma conta grátis no intervals.icu">
              <a href="https://intervals.icu" target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300">
                intervals.icu <ExternalLink className="w-3 h-3" />
              </a>
            </Step>
            <Step n={2} title="Ligue o Garmin lá">
              <em>Settings → Garmin Connect → Connect</em>. Na tela da Garmin, deixe
              {" "}<strong>Wellness</strong> e <strong>Sleep</strong> marcados — é por eles que HRV e sono chegam.
            </Step>
            <Step n={3} title="Copie a chave e o Athlete ID">
              Ainda em <em>Settings</em>, no fim da página, em <em>Developer Settings</em>:
              gere a <strong>API key</strong>. O <strong>Athlete ID</strong> (tipo <code className="text-surface-400">i123456</code>) aparece ali perto.
            </Step>
          </ol>

          <div className="space-y-2">
            <label className="block">
              <span className="text-[11px] text-surface-500">Athlete ID</span>
              <input
                type="text" value={athleteId} onChange={e => setAthleteId(e.target.value)}
                placeholder="i123456" autoComplete="off" autoCapitalize="off" spellCheck={false}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500 mt-0.5"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-surface-500">API key</span>
              <input
                type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="cole aqui" autoComplete="off" autoCapitalize="off" spellCheck={false}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500 mt-0.5"
              />
            </label>
            <button onClick={connect} disabled={busy || apiKey.trim().length === 0} className="btn-primary w-full">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Conferindo com o intervals.icu…</> : <><KeyRound className="w-4 h-4" /> Conectar</>}
            </button>
            <p className="text-[10px] text-surface-500 leading-relaxed">
              A chave fica guardada só no servidor e nunca volta para a tela — nem para você.
              Para revogar, apague-a no intervals.icu.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <div className="text-sm text-surface-300 leading-relaxed min-w-0">
        <p className="font-semibold text-surface-200">{title}</p>
        <div className="text-xs mt-0.5 text-surface-400">{children}</div>
      </div>
    </li>
  );
}

/**
 * "Mandar a semana para o relógio sozinho."
 *
 * Esperar o atleta tocar "enviar" em cada treino, toda segunda, é esperar que
 * ele não envie. Com a chave ligada, o cron que gera o plano põe a semana no
 * calendário junto — e mover um treino de dia no app move o evento também.
 *
 * Carrega o estado antes de desenhar: um interruptor que nasce ligado e pula
 * para desligado meio segundo depois é pior do que meio segundo de espera.
 */
function SendToWatchToggle() {
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/coach/training-prefs")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelado) setLigado(d?.prefs?.sendToWatch !== false); })
      .catch(() => { if (!cancelado) setLigado(true); });
    return () => { cancelado = true; };
  }, []);

  async function alternar() {
    const proximo = !ligado;
    setLigado(proximo);
    setSalvando(true);
    try {
      await fetch("/api/coach/training-prefs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendToWatch: proximo }),
      });
    } catch {
      setLigado(!proximo);   // não ficou salvo: a tela não pode dizer que ficou
    } finally {
      setSalvando(false);
    }
  }

  if (ligado === null) return null;

  return (
    <div className="border-t border-surface-700/60 pt-3">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={alternar}
        disabled={salvando}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg bg-surface-700/50 px-3 text-left text-xs text-surface-300 disabled:opacity-60"
      >
        <span>Mandar os treinos da semana para o relógio</span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${ligado ? "bg-brand-500" : "bg-surface-600"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      <p className="mt-1.5 text-[10px] leading-relaxed text-surface-500">
        {ligado
          ? "Toda segunda, junto com o plano. Mudar um treino de dia no app move ele no relógio também."
          : "Desligado — você ainda pode enviar treino por treino, pelo botão dentro de cada um."}
      </p>
    </div>
  );
}
