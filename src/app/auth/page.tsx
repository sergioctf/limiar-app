"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Activity, Mail, Lock, Loader2, TrendingUp } from "lucide-react";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center mb-4 shadow-lg shadow-brand-500/30">
          <Activity className="w-9 h-9 text-white" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-bold text-surface-100 tracking-tight">Limiar</h1>
        <p className="text-surface-500 text-sm mt-1">Seu hub de performance na corrida</p>
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
      <div className="mt-8 flex items-center gap-2 text-surface-600 text-xs">
        <TrendingUp className="w-3.5 h-3.5" />
        <span>Evolução contínua — corrida com inteligência</span>
      </div>
    </div>
  );
}
