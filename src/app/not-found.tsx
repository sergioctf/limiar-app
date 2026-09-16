import Link from "next/link";
import { Compass, Home } from "lucide-react";

/**
 * 404. Reachable from a stale bookmark, a shared link to a deleted run, or a
 * typo — none of which deserve Next's default black-on-white page in English.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center overlay-safe">
      <div className="card p-6 space-y-5 w-full max-w-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-surface-700 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-surface-400" />
          </div>
          <h1 className="font-bold text-surface-100 text-lg leading-tight">
            Página não encontrada
          </h1>
        </div>

        <p className="text-sm text-surface-400 leading-relaxed">
          Este endereço não existe — ou existia e o treino, a prova ou a corrida
          que estava aqui foi apagada.
        </p>

        <Link href="/" className="btn-primary w-full">
          <Home className="w-4 h-4" />
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
