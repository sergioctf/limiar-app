"use client";

/**
 * Carregando ≠ sem plano.
 *
 * Trocar de semana passava pelo estado vazio enquanto a busca acontecia: por um
 * instante a tela dizia "sem plano gerado ainda" e "antes de gerar o plano",
 * oferecendo um botão de gerar para uma semana que talvez já tivesse plano.
 * Aqui o espaço da agenda fica reservado, e ninguém é convidado a nada.
 */
import { formatWeekRange } from "@/components/coach/week/tone";

export function WeekSkeleton({ week, tabs }: { week: string; tabs: React.ReactNode }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold leading-tight text-surface-100">Sua semana</h2>
          <p className="mt-1 text-sm text-surface-500">{formatWeekRange(week)}</p>
        </div>
        {tabs}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] xl:gap-8">
        <div className="space-y-0.5 rounded-2xl bg-surface-800/40 p-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="h-[56px] animate-pulse rounded-xl bg-surface-700/30" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-surface-800/40" />
      </div>
    </div>
  );
}
