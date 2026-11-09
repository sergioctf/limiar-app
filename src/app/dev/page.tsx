import { notFound } from "next/navigation";
import { isDevPreview } from "@/lib/dev-preview";

export const dynamic = "force-dynamic";

const cases = [
  { id: "atleta", label: "Atleta com histórico", detail: "Hoje, Treinador, Histórico, Saúde, Amigos e Limi IA." },
  { id: "novo", label: "Primeiro acesso", detail: "Recomeça o onboarding com uma conta sem histórico a cada abertura." },
] as const;

export default function DevPreviewPage() {
  if (!isDevPreview()) notFound();
  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-12 text-surface-100">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">Ambiente de desenvolvimento</p>
        <h1 className="text-3xl font-bold">Prévia do Limiar</h1>
        <p className="text-sm text-surface-400">Escolha um cenário para navegar pelo app com dados fictícios.</p>
      </div>
      <ul className="space-y-3">
        {cases.map(scenario => (
          <li key={scenario.id}>
            {/* A full navigation gives the browser a fresh session and clears the router cache. */}
            <a href={`/dev/entrar?cenario=${scenario.id}`} className="card block space-y-1 p-4 focus-visible:outline focus-visible:outline-2">
              <span className="block font-semibold">{scenario.label}</span>
              <span className="block text-sm text-surface-400">{scenario.detail}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
