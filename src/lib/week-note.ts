/**
 * O recado do treinador sobre a semana — e a trava que impede ele de inventar.
 *
 * O recado é escrito pela IA (ADR-02: o motor prescreve, a IA narra). Em
 * 21/09, a semana de 28/09 do Sérgio era de recuperação, 14 km em 3 + 3 + 8, e
 * o recado disse *"mantenha a corrida curta (6 km)"* e *"antes de aumentar o
 * volume total para 20 km"*. Dois números fora do plano, nenhuma palavra sobre
 * recuperação — e o prompt já proibia distâncias. O modelo escreveu assim mesmo.
 *
 * Regra em prompt é pedido, não garantia. A garantia fica aqui:
 *
 *   1. A IA recebe os fatos da semana — incluindo se ela é de recuperação.
 *   2. Todo número em quilômetros que o recado citar precisa ser um desses
 *      fatos (`noteRespectsPlan`).
 *   3. Se não for, o recado da IA é descartado e entra o do motor
 *      (`fallbackWeekNote`), que só diz o que o plano tem.
 */

export interface WeekNoteFacts {
  weeklyKm: number;
  /** A quarta semana do bloco, mais leve por desenho. */
  isRecovery: boolean;
  /** 1–4 dentro do bloco, quando se sabe. */
  cycleWeek: number | null;
  /** As corridas da semana, como o plano as montou. */
  sessions: Array<{ label: string; km: number }>;
  /** O que a semana anterior pediu — referência legítima para comparar. */
  previousPlannedKm: number | null;
  /** Sessões de outras modalidades quando a semana não tem corrida. */
  otherSessions?: number;
}

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

/** Os únicos números em km que o recado pode citar. */
export function allowedWeekNumbers(f: WeekNoteFacts): number[] {
  const out = [f.weeklyKm, ...f.sessions.map(s => s.km)];
  if (f.previousPlannedKm != null) out.push(f.previousPlannedKm);
  return out.filter(n => Number.isFinite(n) && n > 0);
}

/**
 * Todo número seguido de "km" (ou "quilômetros") no recado está entre os
 * permitidos? Aceita vírgula e ponto, e meio quilômetro de arredondamento —
 * "21 km" para uma semana de 20,6 é o motor sendo lido, não inventado.
 */
export function noteRespectsPlan(note: string, allowed: number[]): boolean {
  const cited = Array.from(note.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:km|quil[ôo]metros?)\b/gi))
    .map(m => Number(m[1].replace(",", ".")));
  return cited.every(n => allowed.some(a => Math.abs(a - n) <= 0.5));
}

/**
 * O recado que o motor escreve quando o da IA não passa.
 *
 * Seco de propósito: é melhor um recado curto e verdadeiro do que um bonito com
 * um número que o plano não tem.
 */
export function fallbackWeekNote(f: WeekNoteFacts): string {
  const runs = f.sessions.filter(s => s.km > 0);
  if (f.otherSessions !== undefined && f.weeklyKm === 0 && runs.length === 0) {
    if (f.otherSessions === 0) return "Nenhum treino planejado para esta semana.";
    return f.otherSessions === 1
      ? "Uma sessão planejada para esta semana. Veja os detalhes na agenda."
      : `${f.otherSessions} sessões planejadas para esta semana. Veja os detalhes na agenda.`;
  }
  const longest = runs.reduce<{ label: string; km: number } | null>((a, s) => (!a || s.km > a.km ? s : a), null);

  if (f.isRecovery) {
    const drop = f.previousPlannedKm && f.previousPlannedKm > f.weeklyKm
      ? ` — abaixo dos ${km(f.previousPlannedKm)} da semana anterior de propósito`
      : "";
    return `Semana de recuperação, a quarta do bloco: ${km(f.weeklyKm)} no total${drop}. ` +
      "É quando o corpo absorve as três semanas anteriores; correr leve aqui é o treino, não a falta dele.";
  }

  const long = longest ? `, com o longão de ${km(longest.km)} como sessão principal` : "";
  return `${km(f.weeklyKm)} de corrida esta semana${long}. ` +
    "Se as pernas chegarem pesadas no treino forte, reduza o ritmo antes de reduzir a distância.";
}

/* ────────────────────────────────────────────────────────────────────────────
 * E a trava que impede o recado de envelhecer.
 *
 * O recado é escrito quando a semana nasce. Depois disso o atleta move a
 * corrida de dia, adapta a sessão, reorganiza a semana inteira ou pede uma
 * mudança no chat — seis rotas escrevem o plano — e o texto continua descrevendo
 * a semana que existia antes.
 *
 * Foi o que apareceu na tela do Sérgio em 29/09: o recado falava de "5,5 km na
 * segunda" com a corrida já na terça. O número estava certo, o dia não, e a
 * `noteRespectsPlan` acima só olhava números.
 *
 * A regra nova é estreita de propósito: só reprova quando o texto **amarra uma
 * distância a um dia** e o plano discorda. Citar um dia sem número continua
 * valendo ("mantenha o domingo livre"), porque isso não é uma afirmação sobre a
 * sessão daquele dia.
 * ──────────────────────────────────────────────────────────────────────────── */

const DAY_WORDS: Array<{ re: string; day: string }> = [
  { re: "segunda", day: "Mon" },
  { re: "ter[çc]a", day: "Tue" },
  { re: "quarta",  day: "Wed" },
  { re: "quinta",  day: "Thu" },
  { re: "sexta",   day: "Fri" },
  { re: "s[áa]bado", day: "Sat" },
  { re: "domingo", day: "Sun" },
];

export interface NoteDay {
  day: string;
  distanceKm: number | null;
}

/** Nenhuma distância citada junto de um dia contradiz o plano? */
export function noteMatchesDays(note: string, days: NoteDay[]): boolean {
  const kmOf = new Map(days.map(d => [d.day, d.distanceKm]));

  for (const { re, day } of DAY_WORDS) {
    // "5,5 km na segunda" e "na segunda, 5,5 km" — os dois sentidos, no mesmo
    // período (o ponto final corta o alcance, para não casar frases vizinhas).
    const patterns = [
      new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(?:km|quil[ôo]metros?)[^.!?]{0,40}?\b(?:${re})`, "gi"),
      new RegExp(String.raw`\b(?:${re})\b[^.!?]{0,40}?(\d+(?:[.,]\d+)?)\s*(?:km|quil[ôo]metros?)`, "gi"),
    ];
    for (const p of patterns) {
      for (const m of Array.from(note.matchAll(p))) {
        const cited = Number(m[1].replace(",", "."));
        const planned = kmOf.get(day);
        if (planned == null || Math.abs(planned - cited) > 0.5) return false;
      }
    }
  }
  return true;
}

/**
 * O plano com o recado conferido — e trocado pelo do motor quando envelheceu.
 *
 * Roda na **leitura**, não na escrita, e é por isso que funciona: são seis
 * rotas que mexem no plano (mover, adaptar, reorganizar, trocar o treino de
 * hoje, o chat, e as duas da musculação), e cada uma teria que lembrar de
 * invalidar o texto. Aqui é um lugar só, e nenhuma rota precisa saber que o
 * recado existe.
 */
export function withCheckedNote<T extends {
  ai_message?: string;
  days: Array<{ day: string; distance_km?: number; label?: string; type?: string; strength?: unknown }>;
  cycle?: { week: number; isRecovery: boolean } | null;
}>(plan: T): T {
  const note = plan.ai_message;
  const days: NoteDay[] = plan.days.map(d => ({ day: d.day, distanceKm: d.distance_km ?? null }));
  const sessions = plan.days
    .filter(d => (d.distance_km ?? 0) > 0)
    .map(d => ({ label: d.label ?? "Corrida", km: d.distance_km as number }));
  const weeklyKm = Math.round(sessions.reduce((s, x) => s + x.km, 0) * 10) / 10;

  const facts: WeekNoteFacts = {
    weeklyKm,
    isRecovery: plan.cycle?.isRecovery ?? false,
    cycleWeek: plan.cycle?.week ?? null,
    sessions,
    previousPlannedKm: null,
    otherSessions: plan.days.filter(d => d.strength || (d.type && d.type !== "rest")).length,
  };

  if (weeklyKm === 0) return { ...plan, ai_message: fallbackWeekNote(facts) };
  if (!note) return plan;
  const ok = noteRespectsPlan(note, allowedWeekNumbers(facts)) && noteMatchesDays(note, days);
  return ok ? plan : { ...plan, ai_message: fallbackWeekNote(facts) };
}
