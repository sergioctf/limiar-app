"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, X, Link2, Rocket } from "lucide-react";
import { LimiarMark } from "@/components/LimiarMark";

const STORAGE_KEY = "limiar_onboarded";

interface TourStep {
  icon: string;
  title: string;
  description: string;
  glow: string; // tailwind shadow/glow color
}

const STEPS: TourStep[] = [
  {
    icon: "👋",
    title: "Bem-vindo ao Limiar",
    description: "Seu treinador de corrida com inteligência artificial. Em 30 segundos te mostramos o essencial.",
    glow: "shadow-brand-500/40",
  },
  {
    icon: "🔗",
    title: "Conecte seu Strava",
    description: "Suas corridas importam sozinhas — pace, frequência cardíaca, GPS e elevação. Sem Strava? Registre treinos manualmente.",
    glow: "shadow-orange-500/40",
  },
  {
    icon: "🧠",
    title: "Treinador IA",
    description: "Plano semanal personalizado, análise automática de cada treino e relatórios que mostram sua evolução.",
    glow: "shadow-purple-500/40",
  },
  {
    icon: "🎯",
    title: "Metas e provas",
    description: "Cadastre sua próxima prova e veja exatamente quanto falta entre sua forma atual e o objetivo.",
    glow: "shadow-green-500/40",
  },
  {
    icon: "🏆",
    title: "Conquistas e amigos",
    description: "Desbloqueie 21 badges, dispute o desafio semanal de km e mande 🔥 nas corridas dos seus amigos.",
    glow: "shadow-yellow-500/40",
  },
  {
    icon: "🔔",
    title: "Treino na hora certa",
    description: "Receba o treino do dia às 5:30 e a prévia de amanhã às 22:00, direto no celular. Ative em Configurações.",
    glow: "shadow-blue-500/40",
  },
];

interface Props {
  /** show automatically (e.g. brand-new user). ?tour=1 in the URL forces it. */
  enabled?: boolean;
}

export function OnboardingTour({ enabled = false }: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const forced = typeof window !== "undefined" && window.location.search.includes("tour=1");
    const seen = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY);
    if (forced || (enabled && !seen)) setVisible(true);
  }, [enabled]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function finish(navigateTo?: string) {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setLeaving(true);
    setTimeout(() => {
      setVisible(false);
      if (navigateTo) router.push(navigateTo);
    }, 250);
  }

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center p-5 transition-opacity duration-300 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Backdrop with brand glow */}
      <div className="absolute inset-0 bg-surface-900/95 backdrop-blur-md" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full bg-brand-500/15 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Skip */}
        <button
          onClick={() => finish()}
          className="absolute -top-2 right-0 z-10 flex items-center gap-1 text-xs text-surface-500 hover:text-surface-300 px-2 py-1 transition-colors"
        >
          Pular <X className="w-3.5 h-3.5" />
        </button>

        {/* Card */}
        <div className="card p-6 pt-8 text-center overflow-hidden">
          {/* Animated step content — key remounts to replay the entrance */}
          <div key={step} className="animate-scale-in space-y-4">
            {step === 0 ? (
              <div className="flex justify-center animate-float">
                <LimiarMark size={72} />
              </div>
            ) : (
              <div
                className={`w-20 h-20 mx-auto rounded-3xl bg-surface-700/60 border border-surface-600 flex items-center justify-center text-4xl shadow-lg animate-float ${current.glow}`}
              >
                {current.icon}
              </div>
            )}

            <div className="space-y-2">
              <h2 className="text-xl font-black text-surface-100">{current.title}</h2>
              <p className="text-sm text-surface-400 leading-relaxed px-2">{current.description}</p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-6 mb-5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Passo ${i + 1}`}
                className={`rounded-full transition-all duration-300 ${
                  i === step ? "w-6 h-1.5 bg-brand-500" : "w-1.5 h-1.5 bg-surface-600 hover:bg-surface-500"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          {isLast ? (
            <div className="space-y-2">
              <button
                onClick={() => finish("/settings")}
                className="btn-primary w-full justify-center"
              >
                <Link2 className="w-4 h-4" /> Conectar Strava
              </button>
              <button
                onClick={() => finish()}
                className="btn-secondary w-full justify-center"
              >
                <Rocket className="w-4 h-4" /> Explorar o app
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="btn-secondary px-3"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setStep(s => s + 1)}
                className="btn-primary flex-1 justify-center"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-surface-600 mt-3 tracking-widest uppercase">
          {step + 1} de {STEPS.length}
        </p>
      </div>
    </div>
  );
}
