"use client";

import { useState, useEffect } from "react";
import { Smartphone, Copy, Check, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";

const INGEST_URL = "https://limiar-app.vercel.app/api/ingest/wellness";

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

export function AppleHealthSyncCard() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && token === null) {
      setLoading(true);
      fetch("/api/health/wellness-token")
        .then(r => r.json()).then(d => setToken(d.token ?? null))
        .catch(() => setToken(null)).finally(() => setLoading(false));
    }
  }, [open, token]);

  async function regenerate() {
    setLoading(true);
    try {
      const r = await fetch("/api/health/wellness-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerate: true }) });
      const d = await r.json();
      if (d.token) setToken(d.token);
    } finally { setLoading(false); }
  }

  return (
    <div className="card p-5">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Sincronizar com Apple Saúde (iPhone)</h2>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
      </button>

      {!open && (
        <p className="text-sm text-surface-500 mt-2">
          Deixe a prontidão automática: um Atalho do iPhone lê sono/HRV/FC da Apple Saúde (que o Garmin alimenta) e envia pro Limiar todo dia. Grátis, sem app extra.
        </p>
      )}

      {open && (
        <div className="space-y-4 mt-3">
          {/* Step 0 */}
          <Step n={0} title="No Garmin Connect, ative a Apple Saúde">
            Garmin Connect → <em>Mais → Configurações → Apple Saúde</em> e ative (sono, FC, HRV).
            Assim seus dados do relógio passam a aparecer na Apple Saúde.
          </Step>

          {/* Token + URL */}
          <div className="bg-surface-700/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-surface-500 uppercase tracking-wide">Seu token (cole no Atalho)</span>
              {token && <CopyButton value={token} />}
            </div>
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-surface-500" />
              : <code className="block text-xs text-surface-300 break-all bg-surface-800 rounded p-2">{token ?? "—"}</code>}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-surface-500 uppercase tracking-wide">Endereço (URL)</span>
              <CopyButton value={INGEST_URL} />
            </div>
            <code className="block text-xs text-surface-300 break-all bg-surface-800 rounded p-2">{INGEST_URL}</code>
            {token && (
              <button onClick={regenerate} disabled={loading} className="inline-flex items-center gap-1 text-[11px] text-surface-500 hover:text-red-400 pt-1">
                <RefreshCw className="w-3 h-3" /> gerar novo token (invalida o antigo)
              </button>
            )}
          </div>

          {/* Step 1 */}
          <Step n={1} title="Crie um Atalho no app Atalhos">
            Abra o app <strong>Atalhos</strong> → <strong>+</strong> (novo). Adicione, nesta ordem:
            <ul className="list-disc pl-5 mt-1.5 space-y-1 text-surface-400">
              <li><strong>Encontrar amostras de Saúde</strong> → Análise de Sono → últimas 24h → calcule a duração em segundos.</li>
              <li><strong>Encontrar amostras de Saúde</strong> → Variabilidade da FC → média.</li>
              <li><strong>Encontrar amostras de Saúde</strong> → FC em repouso → último valor.</li>
            </ul>
          </Step>

          {/* Step 2 */}
          <Step n={2} title="Envie pro Limiar">
            Adicione <strong>Obter conteúdo de URL</strong> com:
            <ul className="list-disc pl-5 mt-1.5 space-y-1 text-surface-400">
              <li>URL: o endereço acima · Método: <strong>POST</strong></li>
              <li>Cabeçalho: <code className="text-surface-300">Authorization</code> = <code className="text-surface-300">Bearer SEU_TOKEN</code></li>
              <li>Corpo: <strong>JSON</strong> no formato abaixo (use as variáveis do passo 1)</li>
            </ul>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-surface-500">modelo do corpo (JSON)</span>
              <CopyButton value={`{"days":[{"date":"2026-06-15","sleep_seconds":27000,"hrv_ms":62,"resting_hr":48}]}`} />
            </div>
            <code className="block text-[11px] text-surface-300 break-all bg-surface-800 rounded p-2 mt-1">
              {`{"days":[{"date":"AAAA-MM-DD","sleep_seconds":<segundos>,"hrv_ms":<média>,"resting_hr":<valor>}]}`}
            </code>
          </Step>

          {/* Step 3 */}
          <Step n={3} title="Rode todo dia automaticamente">
            Em <strong>Atalhos → Automação → +</strong> → <em>Hora do dia</em> (ex.: 7h) → execute esse atalho.
            Marque <em>“Executar imediatamente”</em> pra não pedir confirmação.
          </Step>

          <p className="text-[11px] text-surface-600">
            Quando rodar, a prontidão passa a mostrar o selo <strong>“dados do relógio”</strong>. O check-in manual continua disponível como reforço (dor muscular não vem do relógio).
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
      <div className="text-sm text-surface-300 leading-relaxed">
        <p className="font-semibold text-surface-200">{title}</p>
        <div className="text-xs mt-0.5">{children}</div>
      </div>
    </div>
  );
}
