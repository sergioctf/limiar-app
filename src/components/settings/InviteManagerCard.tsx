"use client";

import { useEffect, useState } from "react";
import {
  Ticket, Plus, Copy, Check, Loader2, AlertCircle, Share2, Ban, RotateCcw,
} from "lucide-react";

interface Invite {
  id: string;
  code: string;
  label: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

const APP_URL = "https://limiar-app.vercel.app";

/**
 * Invite management, visible only to admins.
 *
 * Codes are created here and shared as a link — opening it pre-fills the code on
 * the signup screen, so the person receiving it doesn't have to type anything.
 */
export function InviteManagerCard() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(30);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/invites");
      if (!res.ok) { setInvites([]); return; }
      const d = await res.json();
      setInvites(d.invites ?? []);
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setError("Diga para quem é o convite."); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, maxUses, expiresInDays }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) { setLabel(""); load(); }
      else setError(d?.error ?? "Não foi possível criar.");
    } catch {
      setError("Falha na conexão.");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(invite: Invite) {
    await fetch("/api/admin/invites", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: invite.id, active: !invite.active }),
    });
    load();
  }

  const inviteLink = (code: string) => `${APP_URL}/auth?convite=${encodeURIComponent(code)}`;

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked — the text is on screen anyway */ }
  }

  async function share(invite: Invite) {
    const text =
      `Te convidei pro Limiar 🏃\n\n` +
      `Crie sua conta aqui: ${inviteLink(invite.code)}\n` +
      `Se pedir o código: ${invite.code}`;
    // Native share sheet on mobile; clipboard everywhere else.
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* cancelled */ }
    }
    copy(text, invite.id);
  }

  function statusOf(i: Invite): { label: string; className: string } {
    if (!i.active) return { label: "revogado", className: "text-red-400 bg-red-500/10" };
    if (i.expires_at && new Date(i.expires_at) < new Date()) {
      return { label: "expirado", className: "text-surface-500 bg-surface-700/50" };
    }
    if (i.max_uses > 0 && i.used_count >= i.max_uses) {
      return { label: "esgotado", className: "text-surface-500 bg-surface-700/50" };
    }
    return { label: "ativo", className: "text-green-400 bg-green-500/10" };
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
          <Ticket className="w-4.5 h-4.5 text-purple-400" />
        </div>
        <div>
          <h2 className="section-title">Convites</h2>
          <p className="text-[11px] text-surface-500">Visível só para administradores</p>
        </div>
      </div>

      {/* Create */}
      <form onSubmit={create} className="space-y-2 mt-4">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Para quem? Ex: Manoela — indicação"
          className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
        />
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="text-[10px] text-surface-500 uppercase tracking-wide">Usos</span>
            <select value={maxUses} onChange={e => setMaxUses(Number(e.target.value))}
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-2 text-xs text-surface-200 mt-0.5">
              <option value={1}>1 pessoa</option>
              <option value={5}>5 pessoas</option>
              <option value={20}>20 pessoas</option>
              <option value={0}>ilimitado</option>
            </select>
          </label>
          <label className="flex-1">
            <span className="text-[10px] text-surface-500 uppercase tracking-wide">Validade</span>
            <select value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))}
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-2 text-xs text-surface-200 mt-0.5">
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={0}>sem validade</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={creating} className="btn-primary w-full justify-center text-xs py-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Gerar convite</>}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>

      {/* List */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-surface-500" /></div>
        ) : invites.length === 0 ? (
          <p className="text-xs text-surface-500 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Nenhum convite ainda. Gere um acima para liberar um cadastro.
          </p>
        ) : invites.map(i => {
          const status = statusOf(i);
          return (
            <div key={i.id} className="bg-surface-700/30 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-surface-100">{i.code}</p>
                  <p className="text-[11px] text-surface-400 truncate">{i.label}</p>
                  <p className="text-[10px] text-surface-500 mt-0.5">
                    {i.max_uses === 0 ? `${i.used_count} usos · ilimitado` : `${i.used_count}/${i.max_uses} usos`}
                    {i.expires_at && ` · até ${new Date(i.expires_at).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${status.className}`}>
                  {status.label}
                </span>
              </div>

              <div className="flex gap-1.5 mt-2">
                <button onClick={() => share(i)}
                  className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold rounded-lg min-h-[44px] py-1.5 bg-surface-700 text-surface-300 hover:text-brand-300">
                  <Share2 className="w-3 h-3" /> Enviar
                </button>
                <button onClick={() => copy(inviteLink(i.code), i.id)}
                  className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold rounded-lg min-h-[44px] py-1.5 bg-surface-700 text-surface-300 hover:text-brand-300">
                  {copied === i.id ? <><Check className="w-3 h-3 text-green-400" /> copiado</> : <><Copy className="w-3 h-3" /> Link</>}
                </button>
                <button onClick={() => toggle(i)} title={i.active ? "Revogar" : "Reativar"}
                  className="px-2.5 rounded-lg bg-surface-700 text-surface-500 hover:text-surface-200">
                  {i.active ? <Ban className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-surface-500 mt-3 leading-relaxed">
        O link já leva o código preenchido na tela de cadastro. Revogar bloqueia
        na hora, mesmo quem já recebeu o link.
      </p>
    </div>
  );
}
