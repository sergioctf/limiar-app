"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, X, Link2, Rocket } from "lucide-react";
import { LimiarMark } from "@/components/LimiarMark";

/** Exported so the settings button clears the same key the tour writes. */
export const TOUR_STORAGE_KEY = "limiar_onboarded";
const STORAGE_KEY = TOUR_STORAGE_KEY;

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
    description: "Seu treinador de corrida, musculação, natação e ciclismo. Em 30 segundos te mostramos o essencial.",
    glow: "shadow-brand-500/40",
  },
  {
    icon: "📋",
    title: "Um plano que é seu",
    description: "Você escolhe em quais dias treina — 2, 3 ou 6 vezes na semana. O plano se molda à sua rotina, não o contrário.",
    glow: "shadow-purple-500/40",
  },
  {
    icon: "🎯",
    title: "Treino detalhado km a km",
    description: "Cada treino traz ritmo-alvo e faixa de frequência cardíaca por quilômetro, calculados a partir do seu condicionamento. Dá para mandar direto pro relógio.",
    glow: "shadow-orange-500/40",
  },
  {
    icon: "🧪",
    title: "Teste de 3 km",
    description: "É ele que define seus ritmos e zonas com precisão. Sem teste, o app estima pelas suas corridas — funciona, mas o teste afina tudo.",
    glow: "shadow-pink-500/40",
  },
  {
    icon: "🏁",
    title: "Provas e estratégia",
    description: "Cadastre sua prova e receba um plano até lá, mais a estratégia de ritmo, hidratação e géis — atualizada sozinha na reta final.",
    glow: "shadow-green-500/40",
  },
  {
    icon: "🏆",
    title: "Amigos e desafios",
    description: "Dispute quem treina mais dias no mês — vale corrida, musculação, bike e natação — e mande 🔥 nos treinos da galera.",
    glow: "shadow-yellow-500/40",
  },
  {
    icon: "🔔",
    title: "Treino na hora certa",
    description: "Receba o treino do dia às 5:30 e a prévia de amanhã às 22:00, além de alertas de overtraining. Ative em Configurações.",
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
      className={`fixed inset-0 z-[90] flex items-center justify-center overlay-safe transition-opacity duration-300 ${
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
          className="absolute -top-2 right-0 z-10 flex items-center gap-1 text-xs text-surface-500 hover:text-surface-300 px-2 min-h-[44px] py-1 transition-colors"
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

        <p className="text-center text-[10px] text-surface-500 mt-3 tracking-widest uppercase">
          {step + 1} de {STEPS.length}
        </p>
      </div>
    </div>
  );
}
