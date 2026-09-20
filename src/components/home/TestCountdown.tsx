"use client";

/**
 * O relógio do teste de 3 km.
 *
 * Sérgio, 20/09: *"o teste de 3 km, que é uma das coisas mais importantes desse
 * app, que meio que calibra tudo, tá meio largado."* E estava: o app avisava
 * sobre ele em dois lugares discretos — um card dentro do Treinador e uma
 * notificação — nenhum dos dois com uma data.
 *
 * Aqui ele vira contagem. Não "seu teste tem 6 semanas", que é informação sobre
 * o passado, mas "refazer em 9 dias", que é uma coisa para colocar na agenda.
 *
 * A régua é a de `test-status.ts`: 8 semanas é quando os ritmos começam a
 * descrever outra pessoa, 16 é quando passam a estar errados.
 */
import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { Card, Section } from "@/components/ui/Surface";
import { Ring } from "@/components/ui/Ring";
import { daysUntilTestDue, TEST_AGING_WEEKS, TEST_STALE_WEEKS, type TestStatus } from "@/lib/test-status";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function TestCountdown({ status }: { status: TestStatus }) {
  if (status.state === "missing" || !status.latest) {
    return (
      <Section title="Teste de 3 km">
        <Link href="/coach" className="block">
          <Card tone="alert">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
                <FlaskConical className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-surface-100">Você ainda não fez o teste</p>
                <p className="mt-0.5 text-xs text-surface-400">
                  Sem ele o plano monta volume e estrutura, mas não sabe em que ritmo te mandar correr.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-surface-500" />
            </div>
          </Card>
        </Link>
      </Section>
    );
  }

  const days = daysUntilTestDue(status.latest.test_date);
  const overdue = days <= 0;
  const window = TEST_AGING_WEEKS * 7;
  // O anel esvazia conforme o prazo acaba; vencido, fica cheio e vermelho.
  const ratio = overdue ? 1 : Math.max(0, Math.min(1, (window - days) / window));
  const tone = overdue ? "alert" : days <= 14 ? "warn" : "good";

  const headline = overdue
    ? `Refazer há ${plural(Math.abs(days), "dia", "dias")}`
    : days === 0 ? "Refazer hoje"
    : `Refazer em ${plural(days, "dia", "dias")}`;

  const detail = status.state === "stale"
    ? `Passou de ${TEST_STALE_WEEKS} semanas: os ritmos não descrevem mais você.`
    : overdue
      ? "Duas horas de atraso não mudam nada; dois meses sim — todo o plano é calibrado por ele."
      : `Feito em ${new Date(`${status.latest.test_date}T12:00:00`).toLocaleDateString("pt-BR")}. Vale ${TEST_AGING_WEEKS} semanas.`;

  return (
    <Section title="Teste de 3 km">
      <Link href="/coach" className="block">
        <Card tone={overdue ? "alert" : undefined}>
          <div className="flex items-center gap-4">
            <Ring ratio={ratio} size={72} thickness={7} tone={tone}>
              <span className="text-center leading-none">
                <span className="block text-lg font-black tabular-nums">{Math.abs(days)}</span>
                <span className="block text-[9px] uppercase tracking-wider text-surface-500">
                  {overdue ? "atraso" : "dias"}
                </span>
              </span>
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-surface-100">{headline}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-surface-400">{detail}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-surface-500" />
          </div>
        </Card>
      </Link>
    </Section>
  );
}
