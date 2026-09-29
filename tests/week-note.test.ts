/**
 * O recado da semana não pode inventar números.
 *
 * Semana de 28/09 do Sérgio: o motor montou uma semana de recuperação de 14 km
 * (3 + 3 + 8). O recado da IA disse *"mantenha a corrida curta (6 km)"* e
 * *"antes de aumentar o volume total para 20 km"* — dois números que não estão
 * no plano, e nem uma palavra sobre ser semana de recuperação. O prompt já
 * proibia distâncias; o modelo escreveu assim mesmo. Regra em prompt é pedido,
 * não garantia — a garantia tem que estar no código.
 */
import { describe, expect, it } from "vitest";
import { allowedWeekNumbers, fallbackWeekNote, noteMatchesDays, noteRespectsPlan, withCheckedNote, type WeekNoteFacts } from "@/lib/week-note";

const recovery: WeekNoteFacts = {
  weeklyKm: 14,
  isRecovery: true,
  cycleWeek: 4,
  sessions: [
    { label: "Rodagem leve", km: 3 },
    { label: "Leve + 6 tiros curtos", km: 3 },
    { label: "Longão", km: 8 },
  ],
  previousPlannedKm: 21,
};

const REAL_NOTE_2809 =
  "Esta semana a base aeróbica foca em consolidar a consistência que você vem mantendo, reforçando a " +
  "capacidade de correr em ritmo estável enquanto introduz os tiros desejados na quarta‑feira. Como a " +
  "segunda‑feira tem tempo limitado, mantenha a corrida curta (6 km) e foque na musculação antes ou depois " +
  "para não comprometer a qualidade do treino de velocidade. Atenção: verifique a sensação nas pernas antes " +
  "de aumentar o volume total para 20 km, garantindo que a carga extra não gere fadiga acumulada.";

describe("o recado só pode citar o que o plano tem", () => {
  it("recusa o recado real de 28/09, que inventou 6 km e 20 km", () => {
    expect(noteRespectsPlan(REAL_NOTE_2809, allowedWeekNumbers(recovery))).toBe(false);
  });

  it("aceita um recado que cita só os números da semana", () => {
    const ok = "Semana de recuperação: 14 km no total, com um longão de 8 km. O objetivo é absorver as três semanas anteriores.";
    expect(noteRespectsPlan(ok, allowedWeekNumbers(recovery))).toBe(true);
  });

  it("aceita a semana anterior como referência, porque ela também é um fato", () => {
    const ok = "Depois dos 21 km da semana passada, esta cai para 14 km de propósito.";
    expect(noteRespectsPlan(ok, allowedWeekNumbers(recovery))).toBe(true);
  });

  it("aceita um recado sem número nenhum", () => {
    expect(noteRespectsPlan("Semana leve de propósito: o corpo absorve o que foi feito.", allowedWeekNumbers(recovery))).toBe(true);
  });

  it("lê número com vírgula, que é como o app escreve", () => {
    const week: WeekNoteFacts = { ...recovery, sessions: [{ label: "Longão", km: 11.5 }], weeklyKm: 21 };
    expect(noteRespectsPlan("Longão de 11,5 km no sábado.", allowedWeekNumbers(week))).toBe(true);
    expect(noteRespectsPlan("Longão de 12,5 km no sábado.", allowedWeekNumbers(week))).toBe(false);
  });
});

describe("quando o recado da IA não serve, o motor escreve o seu", () => {
  it("numa semana de recuperação, diz que é de recuperação — e por quê", () => {
    const note = fallbackWeekNote(recovery);
    expect(note).toMatch(/recuperação/i);
    expect(note).toContain("14 km");
    expect(noteRespectsPlan(note, allowedWeekNumbers(recovery))).toBe(true);
  });

  it("numa semana comum, fala do volume e do longão", () => {
    const normal: WeekNoteFacts = {
      weeklyKm: 21, isRecovery: false, cycleWeek: 2,
      sessions: [{ label: "Rodagem leve", km: 6 }, { label: "Tiros curtos", km: 3.5 }, { label: "Longão", km: 11.5 }],
      previousPlannedKm: 19,
    };
    const note = fallbackWeekNote(normal);
    expect(note).not.toMatch(/recuperação/i);
    expect(note).toContain("21 km");
    expect(note).toContain("11,5 km");
    expect(noteRespectsPlan(note, allowedWeekNumbers(normal))).toBe(true);
  });
});

describe("o recado envelhece quando o plano muda", () => {
  const days = [
    { day: "Mon", distanceKm: null },
    { day: "Tue", distanceKm: 5.5 },
    { day: "Thu", distanceKm: 8 },
    { day: "Sat", distanceKm: 12 },
  ];

  it("reprova a distância amarrada ao dia errado", () => {
    // O caso real: a corrida foi movida para terça e o texto continuou na segunda.
    expect(noteMatchesDays("Comece leve: 5,5 km na segunda para soltar as pernas.", days)).toBe(false);
  });

  it("aprova quando o dia e a distância batem", () => {
    expect(noteMatchesDays("Comece leve: 5,5 km na terça para soltar as pernas.", days)).toBe(true);
  });

  it("funciona nos dois sentidos da frase", () => {
    expect(noteMatchesDays("Na terça, 5,5 km de rodagem.", days)).toBe(true);
    expect(noteMatchesDays("Na quinta, 5,5 km de rodagem.", days)).toBe(false);
  });

  it("citar um dia sem número continua valendo", () => {
    // "Mantenha o domingo livre" é uma frase legítima sobre um dia de descanso.
    expect(noteMatchesDays("Mantenha o domingo livre e chegue inteiro no sábado.", days)).toBe(true);
  });

  it("não atravessa o ponto final", () => {
    // Duas frases independentes: o número de uma não descreve o dia da outra.
    expect(noteMatchesDays("O longão é no sábado. São 12 km no total.", days)).toBe(true);
  });

  it("o plano sem corrida naquele dia também reprova", () => {
    expect(noteMatchesDays("Segunda tem 6 km fáceis.", days)).toBe(false);
  });
});

describe("withCheckedNote", () => {
  const plan = {
    ai_message: "Comece leve: 5,5 km na segunda para soltar as pernas.",
    days: [
      { day: "Mon", type: "rest", label: "Descanso" },
      { day: "Tue", type: "easy", label: "Rodagem leve", distance_km: 5.5 },
      { day: "Sat", type: "long_run", label: "Longão", distance_km: 12 },
    ],
    cycle: { week: 2, isRecovery: false },
  };

  it("troca o recado velho pelo do motor", () => {
    const out = withCheckedNote(plan);
    expect(out.ai_message).not.toContain("segunda");
    expect(out.ai_message).toContain("17,5 km");
  });

  it("deixa em paz o recado que ainda descreve a semana", () => {
    const ok = { ...plan, ai_message: "Longão de 12 km no sábado é a sessão principal." };
    expect(withCheckedNote(ok).ai_message).toBe(ok.ai_message);
  });

  it("sem recado, nada a fazer", () => {
    const sem = { ...plan, ai_message: undefined };
    expect(withCheckedNote(sem).ai_message).toBeUndefined();
  });
});
