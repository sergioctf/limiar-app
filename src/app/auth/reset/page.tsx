"use client";

import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { createClient } from "@/lib/supabase/client";
import { Lock, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";

/**
 * Set a new password. Reached from the recovery email, which lands on
 * /auth/callback and is forwarded here with an active recovery session.
 */
export default function ResetPasswordPage() {
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [ready, setReady]       = useState<boolean | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);

  // Without a recovery session the form can't do anything — say so up front.
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setReady(!!data.session))
      .catch(() => setReady(false));
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) { setError("A senha precisa ter ao menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center mb-10">
        <BrandLockup />
      </div>

      <div className="w-full max-w-sm card p-6">
        <h1 className="font-bold text-surface-100">Nova senha</h1>

        {ready === false ? (
          <>
            <p className="text-sm text-surface-400 mt-2 leading-relaxed">
              Este link de redefinição expirou ou já foi usado. Solicite um novo na tela de login.
            </p>
            <a href="/auth" className="btn-primary w-full justify-center mt-4">Voltar ao login</a>
          </>
        ) : done ? (
          <p className="text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2 mt-4 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            Senha alterada. Entrando…
          </p>
        ) : (
          <>
            <p className="text-xs text-surface-500 mt-1 mb-5">Escolha uma senha com pelo menos 6 caracteres.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                  <input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={6} autoComplete="new-password"
                    className="input pl-9 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button" onClick={() => setShow(v => !v)}
                    aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Confirmar senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                  <input
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required minLength={6} autoComplete="new-password"
                    className="input pl-9"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

              <button type="submit" disabled={loading || ready === null} className="btn-primary w-full justify-center">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar nova senha"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
