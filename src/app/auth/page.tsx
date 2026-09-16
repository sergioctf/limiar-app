"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, Loader2, Key, Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react";

type Mode = "login" | "signup" | "forgot";

/** Messages for the error codes the auth callback can redirect back with. */
const CALLBACK_ERRORS: Record<string, string> = {
  auth_callback_failed:
    "O link expirou ou já foi usado. Peça um novo email de confirmação abaixo.",
  recovery_failed:
    "O link de redefinição expirou. Solicite um novo.",
};

function AuthForm() {
  const params = useSearchParams();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showPassword, setShow]     = useState(false);
  const [mode, setMode]             = useState<Mode>("login");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const supabase = createClient();

  // Surface callback failures instead of dropping the user on a blank form.
  useEffect(() => {
    const code = params.get("error");
    if (code) setError(CALLBACK_ERRORS[code] ?? "Não foi possível completar a autenticação.");
  }, [params]);

  // An invite link lands here with the code — pre-fill it and open signup so
  // the person doesn't have to retype anything.
  useEffect(() => {
    const invite = params.get("convite");
    if (invite) {
      setAccessCode(invite);
      setMode("signup");
    }
  }, [params]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // ── Password recovery ────────────────────────────────────────────────
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
        });
        if (error) throw error;
        setSuccess("Se existir uma conta com esse email, enviamos um link para redefinir a senha. Verifique também o spam.");
        return;
      }

      // ── Login ────────────────────────────────────────────────────────────
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/";
        return;
      }

      // ── Signup ───────────────────────────────────────────────────────────
      // The invite is checked on the server; no valid code ever reaches this bundle.
      const inviteRes = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode }),
      });
      const invite = await inviteRes.json().catch(() => null);
      if (!inviteRes.ok || !invite?.ok) {
        setError(invite?.error ?? "Código de convite inválido.");
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;

      // Consume the invite only after the account exists.
      fetch("/api/auth/invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId: invite.inviteId, email }),
      }).catch(() => {});

      setSuccess("Conta criada! Confirme pelo link que enviamos no seu email — verifique também o spam.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      if (message.includes("Invalid login credentials")) {
        setError("Email ou senha incorretos.");
      } else if (message.includes("already registered") || message.includes("already been registered")) {
        setError("Este email já está cadastrado. Faça login ou redefina a senha.");
      } else if (message.includes("Email not confirmed")) {
        setError("Confirme seu email antes de entrar — o link está na sua caixa de entrada.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = mode === "login" ? "Entrar"
    : mode === "signup" ? "Criar conta"
    : "Enviar link de redefinição";

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center p-4">
      {/* Brand */}
      <div className="flex flex-col items-center mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/limiar_logo.png"
          alt="Limiar — Performance · Saúde · Evolução"
          className="w-72 max-w-[85vw] select-none"
          draggable={false}
        />
      </div>

      <div className="w-full max-w-sm card p-6">
        {mode === "forgot" ? (
          <button
            onClick={() => switchMode("login")}
            className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-surface-200 mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        ) : (
          <div className="flex gap-1 mb-6 bg-surface-700 rounded-xl p-1">
            {(["login", "signup"] as const).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-all duration-150 ${
                  mode === m ? "bg-brand-500 text-white shadow" : "text-surface-400 hover:text-surface-200"
                }`}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>
        )}

        {mode === "forgot" && (
          <div className="mb-5">
            <h1 className="font-bold text-surface-100">Redefinir senha</h1>
            <p className="text-xs text-surface-500 mt-1">
              Informe seu email e enviaremos um link para criar uma nova senha.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                className="input pl-9"
              />
            </div>
          </div>

          {mode !== "forgot" && (
            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="input pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow(v => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center text-surface-500 hover:text-surface-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-brand-400 hover:text-brand-300 mt-0.5 min-h-[44px] inline-flex items-center"
                >
                  Esqueci minha senha
                </button>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label className="label">Código de convite</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Digite o código recebido"
                  required
                  className="input pl-9"
                />
              </div>
              <p className="text-xs text-surface-500 mt-1">O Limiar ainda está em acesso restrito.</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{success}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
          </button>
        </form>
      </div>

      <p className="mt-8 text-surface-500 text-xs tracking-wide">
        PERFORMANCE · SAÚDE · EVOLUÇÃO
      </p>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
      </div>
    }>
      <AuthForm />
    </Suspense>
  );
}
