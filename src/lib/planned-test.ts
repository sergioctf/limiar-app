/**
 * O teste de 3 km marcado para um dia.
 *
 * O teste era a única coisa importante do app que não existia antes de
 * acontecer: o aviso dizia "seu teste tem 8 semanas" e oferecia *registrar* um
 * novo — um formulário para preencher **depois** de correr. Entre a intenção e
 * a corrida não havia nada, e é exatamente aí que a intenção morre.
 *
 * Agora o atleta marca o dia e o teste entra na semana. Duas regras decidem
 * como ele entra, e as duas vêm do Sérgio (29/09):
 *
 *   • **Não mexe na semana.** O motor não é chamado de novo, o volume não é
 *     recalculado, as outras sessões ficam onde estão. O teste é uma camada
 *     por cima do plano guardado — por isso ele aparece no instante em que é
 *     marcado, sem esperar nada.
 *   • **Conta como quilômetro, e costuma substituir o tiro.** É um treino
 *     forte: 3 km no limite, com aquecimento e volta à calma. Somar isso ao
 *     tiro da semana seria prescrever dois treinos de qualidade no mesmo dia.
 *
 * O que ele substitui, em ordem: a corrida daquele dia (qualquer uma), ou nada
 * — num dia de descanso o teste simplesmente aparece. A musculação do dia
 * continua onde está: são sessões diferentes.
 */
import type { StructuredWorkout, WeeklyPlanDay } from "@/types";

export interface PlannedTest {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  distanceKm: number;
  status: "scheduled" | "done" | "skipped";
}

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type DayKey = (typeof DAY_ORDER)[number];

/** O dia da semana (Mon…Sun) de uma data, para casar com o plano. */
export function dayKeyOfDate(date: string): DayKey {
  const d = new Date(`${date}T12:00:00`);
  return DAY_ORDER[(d.getDay() + 6) % 7];
}

/** A segunda-feira da semana de uma data. */
export function mondayOfDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * A sessão do teste: aquecimento, os 3 km no limite, volta à calma.
 *
 * Seis quilômetros no total — é o que o protocolo pede, e é o número que entra
 * no volume da semana. Um teste de 3 km "puro" custaria 3 km no papel e 6 na
 * perna.
 */
export function testSession(day: DayKey, dayPt: string, distanceKm = 3): WeeklyPlanDay {
  const structure: StructuredWorkout = {
    blocks: [
      { kind: "warmup", distance_km: 2, intensity: "E", note: "Solto, sem pressa — o teste começa depois." },
      { kind: "run", distance_km: distanceKm, intensity: "I", note: "No limite do que dá para sustentar até o fim." },
      { kind: "cooldown", distance_km: 1, intensity: "E", note: "Trote leve para voltar." },
    ],
  };

  return {
    day, dayPt,
    type: "test",
    sport: "corrida",
    label: `Teste de ${distanceKm} km`,
    distance_km: 2 + distanceKm + 1,
    description:
      `Aquecimento de 2 km, ${distanceKm} km no maior ritmo que você sustenta até o fim, e 1 km de volta à calma. ` +
      "É ele que recalibra ritmos, faixas de FC e previsões — corra como se fosse prova.",
    structure,
  } as WeeklyPlanDay;
}

/**
 * O plano com o teste marcado dentro dele.
 *
 * Devolve o mesmo objeto quando não há nada a fazer (teste de outra semana, já
 * feito, cancelado), para a tela não re-renderizar à toa.
 */
export function applyPlannedTest<T extends { week_start: string; days: WeeklyPlanDay[] }>(
  plan: T,
  test: PlannedTest | null,
): T {
  if (!test || test.status !== "scheduled") return plan;
  if (mondayOfDate(test.date) !== plan.week_start) return plan;

  const key = dayKeyOfDate(test.date);
  const existing = plan.days.find(d => d.day === key);
  const session = testSession(key, existing?.dayPt ?? key, test.distanceKm);

  const days = plan.days.map(d => {
    if (d.day !== key) return d;
    // A musculação do dia continua: são duas sessões, não uma escolha.
    return { ...session, dayPt: d.dayPt, strength: d.strength } as WeeklyPlanDay;
  });

  // Dia que o plano nem tinha (semana curta, plano antigo): entra na ordem.
  if (!existing) {
    days.push(session);
    days.sort((a, b) => DAY_ORDER.indexOf(a.day as DayKey) - DAY_ORDER.indexOf(b.day as DayKey));
  }

  return { ...plan, days };
}

/** O que o teste tirou do lugar, para a tela poder dizer. */
export function replacedByTest(
  plan: { week_start: string; days: WeeklyPlanDay[] },
  test: PlannedTest | null,
): WeeklyPlanDay | null {
  if (!test || test.status !== "scheduled") return null;
  if (mondayOfDate(test.date) !== plan.week_start) return null;
  const day = plan.days.find(d => d.day === dayKeyOfDate(test.date));
  return day && day.type !== "rest" && day.sport !== "musculacao" ? day : null;
}

/** Os dias que fazem sentido oferecer: de amanhã até duas semanas à frente. */
export function testDateOptions(today: string, weeks = 2): string[] {
  const out: string[] = [];
  const d = new Date(`${today}T12:00:00`);
  for (let i = 0; i < weeks * 7; i++) {
    d.setDate(d.getDate() + 1);
    const p = (n: number) => String(n).padStart(2, "0");
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out;
}
