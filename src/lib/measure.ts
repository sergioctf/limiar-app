import type { StructuredWorkout, WeeklyPlanDay, WorkoutStep } from "@/types";

/**
 * Por quilômetro ou por tempo — a unidade em que o atleta lê o plano.
 *
 * ## Por que existe
 *
 * "Acho que temos que adicionar a opção dos treinos do treinador serem por
 * tempo ou km. Eu prefiro km, mas muita gente prefere por tempo" (Sérgio,
 * 13/10). As duas escolas são legítimas e a diferença é real: *"corra 8 km"* e
 * *"corra 45 minutos"* produzem treinos diferentes no mesmo corpo em dias
 * diferentes — num dia ruim, 8 km custam uma hora, enquanto 45 minutos custam
 * 45 minutos.
 *
 * ## O que NÃO muda
 *
 * O motor continua prescrevendo em quilômetros. É neles que estão a rampa de
 * volume, o teto do longão, a periodização e a adesão — reescrever isso para
 * produzir minutos seria trocar o motor inteiro por uma preferência de leitura.
 *
 * O que muda é **em que unidade o plano é lido**: o mesmo treino de 8 km
 * aparece como "45 min" para quem escolheu tempo, convertido pelo ritmo que o
 * próprio motor já prescreveu para aquela sessão. A conversão é determinística
 * e reversível, e por isso trocar a preferência não exige regenerar nada.
 *
 * `distance_km` segue sendo a verdade guardada. `duration_min` anda junto.
 */

export type MeasureBy = "km" | "time";

export const MEASURE_LABEL: Record<MeasureBy, string> = {
  km:   "Por distância",
  time: "Por tempo",
};

/** Arredonda para o múltiplo de 5 min mais próximo, com piso de 10. */
function arredonda(min: number): number {
  return Math.max(10, Math.round(min / 5) * 5);
}

/**
 * O ritmo médio de um alvo como `6:12–5:48/km`, em segundos por km.
 *
 * O meio da faixa, não a ponta: prescrever o tempo do ritmo mais rápido
 * transformaria "corra leve" em "corra leve, no limite do leve".
 */
export function paceMidSeconds(pace: string | undefined | null): number | null {
  if (!pace) return null;
  const limpo = pace.replace(/\s/g, "").replace(/[–—]/g, "-");
  const nums = Array.from(limpo.matchAll(/(\d{1,2}):(\d{2})/g))
    .map(m => Number(m[1]) * 60 + Number(m[2]))
    .filter(n => n > 60 && n < 1800);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Quantos minutos aquela distância leva, no ritmo prescrito para ela.
 *
 * Sem ritmo não há conversão honesta — e chutar um ritmo médio para um atleta
 * que ainda não fez o teste é inventar o número mais importante da tela.
 */
export function minutesForDistance(distanceKm: number | undefined, pace: string | undefined): number | null {
  if (!distanceKm || distanceKm <= 0) return null;
  const sec = paceMidSeconds(pace);
  if (!sec) return null;
  return arredonda((distanceKm * sec) / 60);
}

/** O mesmo, para um passo de treino estruturado (sem arredondar a cinco). */
export function stepMinutes(step: Pick<WorkoutStep, "distance_km" | "duration_min" | "pace">): number | null {
  if (step.duration_min != null && step.duration_min > 0) return step.duration_min;
  if (!step.distance_km || step.distance_km <= 0) return null;
  const sec = paceMidSeconds(step.pace);
  if (!sec) return null;
  return Math.round((step.distance_km * sec / 60) * 10) / 10;
}

/**
 * O tamanho da sessão, escrito na unidade que o atleta escolheu.
 *
 * Volta para a outra unidade quando a escolhida não tem como ser calculada —
 * um atleta sem teste não tem ritmo, e "45 min" inventado é pior do que "8 km".
 */
export function sessionTarget(
  day: Pick<WeeklyPlanDay, "distance_km" | "duration_min" | "pace">,
  measureBy: MeasureBy = "km",
): string | null {
  if (measureBy === "time") {
    const min = day.duration_min ?? minutesForDistance(day.distance_km, day.pace);
    if (min) return `${min} min`;
  }
  if (day.distance_km != null && day.distance_km > 0) {
    return `${Number(day.distance_km.toFixed(1)).toString().replace(".", ",")} km`;
  }
  if (day.duration_min != null && day.duration_min > 0) return `${day.duration_min} min`;
  return null;
}

/**
 * A sessão como estrutura executável, inventando uma quando não há.
 *
 * Treinos de qualidade e longões já vêm com `structure` do motor. Uma rodagem
 * simples não vem — e ela é a maioria da semana. Para o relógio isso importa:
 * "8 km entre 6:12 e 5:48" é um treino perfeitamente executável de um passo
 * só, e sem isto o envio automático da semana entregaria só os dias de tiro.
 *
 * Com a preferência em tempo, o passo único vira duração — é o que o atleta
 * combinou de perseguir, e é o que o relógio deve cobrar dele.
 */
export function sessionAsStructure(
  day: Pick<WeeklyPlanDay, "structure" | "distance_km" | "duration_min" | "pace" | "type">,
  measureBy: MeasureBy = "km",
): StructuredWorkout | null {
  if (day.structure?.blocks?.length) return day.structure;
  if (day.type === "rest") return null;

  const pace = day.pace;
  if (measureBy === "time") {
    const min = day.duration_min ?? minutesForDistance(day.distance_km, pace);
    if (min) return { blocks: [{ kind: "run", duration_min: min, pace }] };
  }
  if (day.distance_km != null && day.distance_km > 0) {
    return { blocks: [{ kind: "run", distance_km: day.distance_km, pace }] };
  }
  if (day.duration_min != null && day.duration_min > 0) {
    return { blocks: [{ kind: "run", duration_min: day.duration_min, pace }] };
  }
  return null;
}

/**
 * O plano relido na unidade escolhida.
 *
 * Preenche `duration_min` onde dá para calcular, sem apagar `distance_km`. Com
 * os dois presentes, trocar a preferência muda a tela na hora — ninguém precisa
 * regenerar a semana para ler o próprio plano de outro jeito.
 */
export function withDurations<T extends { days?: WeeklyPlanDay[] }>(plan: T): T {
  if (!Array.isArray(plan.days)) return plan;
  return {
    ...plan,
    days: plan.days.map(day => {
      if (day.duration_min != null || day.type === "rest") return day;
      const min = minutesForDistance(day.distance_km, day.pace);
      return min ? { ...day, duration_min: min } : day;
    }),
  };
}
