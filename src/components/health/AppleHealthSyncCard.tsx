"use client";

import { useState, useEffect } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Wifi, AlertCircle, Flame, KeyRound } from "lucide-react";

const INGEST_URL = "https://limiar-app.vercel.app/api/ingest/wellness";

interface WellnessStatus {
  connected: boolean;
  daysLast30: number;
  latest: {
    date: string; source: string | null; sleepHours: number | null;
    hrvMs: number | null; restingHr: number | null; bodyBattery: number | null;
  } | null;
  energy: {
    date: string; activeKcal: number | null; restingKcal: number | null; updatedAt: string | null;
  } | null;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}
      className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 shrink-0"
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{label ?? (done ? "copiado" : "copiar")}
    </button>
  );
}

const kcal = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));

/**
 * The day's energy, from Apple Health.
 *
 * Garmin writes active and resting energy to Apple Health and nowhere else an
 * app can reach — intervals.icu carries the night, not the day's calories. So
 * this shortcut's job narrowed to two numbers, which also makes it the easiest
 * shortcut in the app to build: two sums and one request.
 *
 * It used to ask for HRV, resting heart rate and sleep as well, and nobody
 * finished it. Those still work for an Apple Watch wearer, and are offered as
 * the optional last step rather than the first.
 */
export function AppleHealthSyncCard() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  /** Existe um token nesta conta? O valor, não — só o app que o gerou o viu. */
  const [jaExiste, setJaExiste] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<WellnessStatus | null>(null);
  const [checking, setChecking] = useState(false);

  /** Ask the server whether energy is actually landing. */
  async function checkConnection() {
    setChecking(true);
    try {
      const r = await fetch("/api/health/wellness-status");
      setStatus(r.ok ? await r.json() : null);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }

  /*
   * Check on mount, not on open. A setup guide that cannot tell you it is not
   * working is a setup guide nobody finishes.
   */
  useEffect(() => { void checkConnection(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    O app não sabe mais o token — o banco guarda o hash dele.

    Antes esta tela pedia o token e o mostrava para sempre. Agora ela só
    pergunta se existe um; o valor aparece uma única vez, no instante em que é
    gerado. É como funciona qualquer chave de API, e é o que fecha a leitura da
    coluna por qualquer usuário logado (ver `src/lib/wellness-token.ts`).
  */
  useEffect(() => {
    if (!open || jaExiste !== null) return;
    setLoading(true);
    fetch("/api/health/wellness-token")
      .then(r => r.json()).then(d => setJaExiste(d.hasToken === true))
      .catch(() => setJaExiste(false)).finally(() => setLoading(false));
  }, [open, jaExiste]);

  async function regenerate() {
    setLoading(true);
    try {
      const r = await fetch("/api/health/wellness-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerate: true }) });
      const d = await r.json();
      if (d.token) { setToken(d.token); setJaExiste(true); }
    } finally { setLoading(false); }
  }

  const energy = status?.energy ?? null;

  return (
    <div className="card p-5">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <h2 className="section-title">Calorias do dia</h2>
            <p className="text-xs text-surface-500">Do relógio, pela Apple Saúde (iPhone)</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-surface-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-surface-500 shrink-0" />}
      </button>

      {!open && (
        <div className="mt-3 space-y-1.5">
          {/* The truth, before the pitch. */}
          {energy ? (
            <p className="text-sm text-green-400 flex items-start gap-1.5">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Chegando — {energy.date}: {kcal(energy.activeKcal)} ativas · {kcal(energy.restingKcal)} em repouso
              </span>
            </p>
          ) : checking ? (
            <p className="text-sm text-surface-500 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando…
            </p>
          ) : (
            <p className="text-sm text-yellow-400 flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              Nenhuma caloria chegou ainda — a meta do dia usa a estimativa pela fórmula.
            </p>
          )}
          <p className="text-sm text-surface-500">
            Um Atalho do iPhone soma as calorias que o Garmin grava na Apple Saúde e manda
            pro Limiar. Grátis, sem app extra, cerca de 5 minutos para montar.
          </p>
        </div>
      )}

      {open && (
        <div className="space-y-4 mt-4">
          <Step n={0} title="No Garmin Connect, ligue a Apple Saúde">
            Garmin Connect → <em>Mais → Configurações → Apps conectados → Apple Saúde</em> e
            permita <strong>Energia Ativa</strong> e <strong>Energia em Repouso</strong>.
          </Step>

          {/* Token + URL */}
          <div className="bg-surface-700/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-surface-500">Seu token (cole no Atalho)</span>
              {token && <CopyButton value={token} />}
            </div>

            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-surface-500" />
            ) : token ? (
              <>
                <code className="block break-all rounded bg-surface-800 p-2 text-xs text-surface-300">{token}</code>
                <p className="text-[11px] leading-relaxed text-yellow-400/90">
                  Copie agora: ele aparece uma vez só. Perdeu, é só gerar outro.
                </p>
              </>
            ) : (
              <>
                <button
                  onClick={regenerate}
                  disabled={loading}
                  className="btn-secondary min-h-[44px] w-full justify-center text-xs"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {jaExiste ? "Gerar um novo token" : "Gerar meu token"}
                </button>
                <p className="text-[11px] leading-relaxed text-surface-500">
                  {jaExiste
                    ? "Já existe um token nesta conta. O app não guarda o valor — gerar outro invalida o anterior."
                    : "O token aparece uma vez só, no momento em que é gerado."}
                </p>
              </>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-surface-500 uppercase tracking-wide">Endereço (URL)</span>
              <CopyButton value={INGEST_URL} />
            </div>
            <code className="block text-xs text-surface-300 break-all bg-surface-800 rounded p-2">{INGEST_URL}</code>
            {token && (
              <button onClick={regenerate} disabled={loading} className="inline-flex items-center gap-1 pt-1 text-[11px] text-surface-500 hover:text-red-400">
                <RefreshCw className="h-3 w-3" /> gerar outro (invalida este)
              </button>
            )}
          </div>

          <Step n={1} title="Duas somas">
            No app <strong>Atalhos</strong> → <strong>+</strong>, adicione:
            <ul className="list-disc pl-5 mt-1.5 space-y-1 text-surface-400">
              <li><strong>Encontrar Amostras de Saúde</strong> → tipo <em>Energia Ativa</em>, data de início <em>é hoje</em>.</li>
              <li><strong>Calcular Estatísticas</strong> → <em>Soma</em> dessas amostras.</li>
              <li>Repita as duas ações para <em>Energia em Repouso</em>.</li>
            </ul>
          </Step>

          <Step n={2} title="Envie pro Limiar">
            Adicione <strong>Obter Conteúdo de URL</strong>:
            <ul className="list-disc pl-5 mt-1.5 space-y-1 text-surface-400">
              <li>URL: o endereço acima · Método: <strong>POST</strong></li>
              <li>Corpo da solicitação: <strong>Formulário</strong></li>
              <li>Campos abaixo — o valor de cada um é a soma do passo 1</li>
            </ul>
            <div className="mt-2 space-y-1">
              {[
                ["token", "seu token acima"],
                ["active_kcal", "soma de Energia Ativa"],
                ["resting_kcal", "soma de Energia em Repouso"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between bg-surface-800 rounded px-2 py-1.5">
                  <code className="text-[11px] text-brand-300">{k}</code>
                  <span className="text-[10px] text-surface-500">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-surface-500 mt-1.5">
              Sem campo <code className="text-surface-400">date</code> — o Limiar usa o dia de hoje no horário de Brasília.
            </p>
          </Step>

          <Step n={3} title="Deixe rodar sozinho">
            <strong>Atalhos → Automação → +</strong>, duas vezes:
            <ul className="list-disc pl-5 mt-1.5 space-y-1 text-surface-400">
              <li><em>App</em> → Garmin Connect → <em>É Fechado</em>: roda logo depois de cada sincronização do relógio.</li>
              <li><em>Hora do Dia</em> → 22:00: fecha o dia com o total.</li>
            </ul>
            Em ambas, escolha <em>Executar Imediatamente</em> para não pedir confirmação.
          </Step>

          {/*
            Sleep through Apple Health, even for a Garmin wearer.

            On Monday 14/09 the night's HRV reached intervals.icu and the night's
            sleep did not — Garmin delivered one summary and held the other, and
            the app showed the night before as "last night" all day. Garmin writes
            sleep to Apple Health on the same sync, so the shortcut that already
            runs when Garmin Connect closes can carry it in the same minute.
            Whichever source lands first fills the field; the other never erases it.
          */}
          <Step n={4} title="Sono no mesmo minuto do Garmin (recomendado)">
            O intervals.icu às vezes recebe o sono horas depois do HRV. Pela Apple Saúde ele chega
            assim que o Garmin Connect sincroniza. No mesmo atalho, antes do envio:
            <ul className="list-disc pl-5 mt-1.5 space-y-1 text-surface-400">
              <li><strong>Encontrar Amostras de Saúde</strong> → <em>Análise do Sono</em>, data de início <em>nos últimos 1 dia</em>, valor <em>não é Acordado</em> e <em>não é Na Cama</em>.</li>
              <li><strong>Calcular Estatísticas</strong> → <em>Soma</em> da duração dessas amostras.</li>
              <li>No formulário, o campo <code className="text-surface-400">sleep_minutes</code> (ou <code className="text-surface-400">sleep_hours</code>, se o atalho mostrar em horas) com essa soma.</li>
            </ul>
            <p className="mt-1.5 text-surface-500">
              O &quot;testar conexão&quot; abaixo mostra as horas que chegaram — se vier um número absurdo, troque o campo.
            </p>
          </Step>

          <Step n={5} title="Usa Apple Watch em vez de Garmin? (opcional)">
            Acrescente também <code className="text-surface-400">hrv_ms</code> (média de Variabilidade da FC)
            e <code className="text-surface-400">resting_hr</code> — com Garmin, esses dois vêm pelo intervals.icu.
          </Step>

          {/* Verification */}
          <div className="bg-surface-700/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-surface-500 uppercase tracking-wide">Verificação</span>
              <button
                onClick={checkConnection}
                disabled={checking}
                className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
              >
                {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                testar conexão
              </button>
            </div>

            {energy ? (
              <p className="text-xs text-green-400 font-semibold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                {energy.date}: {kcal(energy.activeKcal)} kcal ativas · {kcal(energy.restingKcal)} em repouso
              </p>
            ) : (
              <p className="text-xs text-yellow-400 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Nenhuma caloria recebida ainda. Rode o atalho uma vez manualmente e toque em “testar conexão”.
              </p>
            )}
            {status?.latest?.sleepHours != null && (
              <p className="text-xs text-surface-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-green-400" />
                Sono de {status.latest.date}: {status.latest.sleepHours} h
              </p>
            )}
          </div>

          <p className="text-[11px] text-surface-500">
            Com as calorias chegando, o card de Nutrição troca a fórmula pelo que o relógio mediu e marca os números com “relógio”.
          </p>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <div className="text-sm text-surface-300 leading-relaxed min-w-0">
        <p className="font-semibold text-surface-200">{title}</p>
        <div className="text-xs mt-0.5">{children}</div>
      </div>
    </div>
  );
}
