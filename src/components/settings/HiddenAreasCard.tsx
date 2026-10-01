"use client";

/**
 * O que ainda não apareceu no menu — e o que falta para aparecer.
 *
 * Esta é a metade honesta de esconder navegação. O app passou a mostrar só as
 * áreas que têm o que mostrar (01/10), o que resolve a tela cheia para quem
 * acabou de entrar — mas uma porta que some sem explicação é pior do que uma
 * porta vazia: a pessoa não sabe se o recurso não existe, se ela não tem
 * acesso, ou se quebrou.
 *
 * Então ele some do menu e aparece aqui, dito como promessa: "Gráficos
 * aparecem a partir de 3 corridas". Cada linha continua clicável, porque
 * escondido não é proibido.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, EyeOff } from "lucide-react";
import type { HiddenArea } from "@/lib/nav-visibility";

export function HiddenAreasCard() {
  const [areas, setAreas] = useState<HiddenArea[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/nav-visibility", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && Array.isArray(d?.hidden)) setAreas(d.hidden as HiddenArea[]); })
      .catch(() => { /* sem resposta, sem card */ });
    return () => { cancelled = true; };
  }, []);

  if (areas.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <EyeOff className="mt-0.5 h-4.5 w-4.5 shrink-0 text-surface-500" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-surface-100">Ainda não no menu</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-surface-500">
            O app mostra as áreas conforme elas têm o que mostrar. Estas estão esperando:
          </p>

          <ul className="mt-2.5 space-y-1">
            {areas.map(a => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 transition-colors hover:bg-surface-700/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-surface-200">{a.label}</span>
                    <span className="block text-[11px] leading-snug text-surface-500">{a.unlocks}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-surface-600" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
