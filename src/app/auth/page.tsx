"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, Loader2, Key } from "lucide-react";

const ACCESS_CODE = "Manoela Pinheiro";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.href = "/";
      } else {
        if (accessCode !== ACCESS_CODE) {
          setError("Código de acesso inválido.");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setSuccess("Conta criada! Verifique seu email para confirmar o cadastro.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      if (message.includes("Invalid login credentials")) {
        setError("Email ou senha incorretos.");
      } else if (message.includes("already registered")) {
        setError("Este email já está cadastrado. Faça login.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

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

      {/* Card */}
      <div className="w-full max-w-sm card p-6">
        <div className="flex gap-1 mb-6 bg-surface-700 rounded-xl p-1">
          <button
            onClick={() => { setMode("login"); setError(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
              mode === "login"
                ? "bg-brand-500 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => { setMode("signup"); setError(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
              mode === "signup"
                ? "bg-brand-500 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            Criar conta
          </button>
        </div>

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
                className="input pl-9"
              />
            </div>
          </div>

          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="input pl-9"
              />
            </div>
          </div>

          {mode === "signup" && (
            <div>
              <label className="label">Código de acesso</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Digite o código de acesso"
                  required
                  className="input pl-9"
                />
              </div>
              <p className="text-xs text-surface-500 mt-1">Necessário para criar uma conta.</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2">
              {success}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === "login" ? (
              "Entrar"
            ) : (
              "Criar conta"
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="mt-8 text-surface-600 text-xs tracking-wide">
        PERFORMANCE · SAÚDE · EVOLUÇÃO
      </p>
    </div>
  );
}
