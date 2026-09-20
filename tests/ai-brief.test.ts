/**
 * O dossiê da IA central.
 *
 * O que estes testes protegem é uma regra só: **a IA não pode saber nada que o
 * motor não calculou**. Na prática isso quer dizer que uma seção sem dado não
 * existe — e uma seção que não existe não vira sugestão, não vira resposta e
 * não entra no texto que vai para o modelo. Se um número aparecer numa resposta
 * sem estar aqui, ele foi inventado.
 */
import { describe, expect, it } from "vitest";
import {
  buildBrief, briefText, sectionOf, suggestionsFor, suggestionById, answerSuggestion,
  type BriefInput,
} from "@/lib/ai-brief";
import { weekMovement } from "@/lib/week-movement";
import { METRICS } from "./fixtures";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const weekStart = "2026-09-14";
const today = "2026-09-17";

const strength = { exercises: [], estimatedMinutes: 45 } as unknown as WeeklyPlanDay["strength"];
const d = (day: WeeklyPlanDay["day"], over: Partial<WeeklyPlanDay>): WeeklyPlanDay =>
  ({ day, dayPt: day, sport: "corrida", type: "rest", label: "Descanso", description: "", ...over } as WeeklyPlanDay);

const plan: WeeklyPlanData = {
  week_start: weekStart, generated_at: "x",
  days: [
    d("Mon", { type: "easy", label: "Rodagem leve", distance_km: 6, strength }),
    d("Tue", { type: "strength", sport: "musculacao", label: "Musculação", strength }),
    d("Wed", { type: "intervals", label: "Subidas 6×45 s", distance_km: 3.5 }),
    d("Thu", { type: "strength", sport: "musculacao", label: "Musculação", strength }),
    d("Sat", { type: "long_run", label: "Longão", distance_km: 9.5 }),
  ],
};

const runs = [
  { id: "r1", date: "2026-09-14", distance_km: 6.01, duration_seconds: 2174, calories: 412 },
  { id: "r2", date: "2026-09-16", distance_km: 8.01, duration_seconds: 3221, calories: 509 },
];
const activities = [
  { id: "a1", date: "2026-09-14", sport_type: "WeightTraining", duration_seconds: 3137, calories: 347 },
  { id: "a2", date: "2026-09-15", sport_type: "WeightTraining", duration_seconds: 3510, calories: 322 },
];

const week = weekMovement({ weekStart, today, plan, runs, activities });

/** Um atleta sem nada: o caso que mais importa, porque é onde se inventa. */
const EMPTY: BriefInput = {
  date: today, firstName: "Sérgio",
  today: null, recovery: null, week: null, recap: null, progress: null,
  fitness: [], overtraining: null, metrics: null, testDate: null, sleep: null,
  adherence: [], races: [], goals: [], shoes: [], shoeRuns: [],
};

const full = (over: Partial<BriefInput> = {}): BriefInput => ({ ...EMPTY, week, ...over });

describe("o dossiê só fala do que existe", () => {
  it("um atleta sem dado nenhum não gera seção nenhuma", () => {
    const brief = buildBrief(EMPTY);
    expect(brief.sections).toEqual([]);
    expect(suggestionsFor(brief)).toEqual([]);
  });

  it("não diz 'está tudo bem' para quem não tem dado", () => {
    // O silêncio é honesto; a tranquilidade falsa, não.
    expect(sectionOf(buildBrief(EMPTY), "alertas")).toBeNull();
  });

  it("sem teste de calibração não existe seção de ritmos", () => {
    expect(sectionOf(buildBrief(full()), "ritmos")).toBeNull();
    expect(sectionOf(buildBrief(full({ metrics: METRICS, testDate: "2026-08-30" })), "ritmos")).not.toBeNull();
  });

  it("uma sugestão sem dado não chega a ser oferecida", () => {
    const labels = suggestionsFor(buildBrief(full())).map(s => s.id);
    expect(labels).toContain("semana");
    expect(labels).not.toContain("ritmos");
    expect(labels).not.toContain("tenis");
  });

  it("e, se for pedida assim mesmo, não inventa resposta", () => {
    const brief = buildBrief(full());
    expect(answerSuggestion(brief, suggestionById("ritmos")!)).toBeNull();
  });
});

describe("a semana, escrita", () => {
  const brief = buildBrief(full());
  const semana = sectionOf(brief, "semana")!;

  it("conta sessões feitas contra sessões previstas", () => {
    // Quatro feitas (2 corridas + 2 academias), seis previstas: segunda pede duas.
    expect(semana.headline).toBe("4 de 6 sessões, 3h21");
    expect(semana.lines[0]).toBe("4 sessões feitas de 6 previstas.");
  });

  it("diz os dias e o tempo sem misturar com as sessões", () => {
    expect(semana.lines[1]).toBe("3 dias treinados de 5 previstos, 3h21 em atividade.");
  });

  it("mantém a distância por esporte, nunca somada", () => {
    expect(semana.lines).toContain("Corrida: 2 sessões · 14 km · 1h30");
    expect(semana.lines).toContain("Musculação: 2 sessões · 1h51");
  });

  it("nomeia o que ficou por fazer", () => {
    expect(semana.lines.some(l => l.startsWith("Ainda por fazer"))).toBe(true);
  });

  it("diz de onde as calorias vieram", () => {
    expect(semana.lines).toContain("Calorias da semana: 1590 kcal (somadas dos treinos).");
  });
});

describe("os alertas só falam do que outro leitor já marcou", () => {
  it("sem achado, e com dados na mesa, diz que não há nada", () => {
    const alertas = sectionOf(buildBrief(full()), "alertas")!;
    expect(alertas.headline).toBe("Nada pedindo atenção agora.");
  });

  it("repete o sinal de sobrecarga que o motor levantou, sem criar outro", () => {
    const brief = buildBrief(full({
      overtraining: {
        level: "caution", tsb: -22, acwr: 1.4,
        signals: [{ id: "tsb", label: "Forma muito negativa", detail: "TSB em −22", severity: "caution" }],
        recommendation: "Vale uma semana mais leve.",
      },
    }));
    const alertas = sectionOf(brief, "alertas")!;
    expect(alertas.headline).toBe("1 ponto pedindo atenção");
    expect(alertas.lines).toEqual(["Forma muito negativa: TSB em −22"]);
  });
});

describe("o texto que vai para o modelo", () => {
  const brief = buildBrief(full({ metrics: METRICS, testDate: "2026-08-30" }));
  const text = briefText(brief);

  it("leva as seções, com o que cada uma concluiu", () => {
    expect(text).toContain("## Minha semana");
    expect(text).toContain("4 de 6 sessões");
    expect(text).toContain("## Meus ritmos e zonas");
  });

  it("leva também a fonte de cada seção, para a resposta poder se explicar", () => {
    expect(text).toContain("(fonte: plano da semana e tudo que foi registrado nela)");
    expect(text).toContain("(fonte: teste de 30/08 (fórmulas de Daniels))");
  });

  it("não leva nada de uma seção que não existe", () => {
    expect(text).not.toContain("Meus tênis");
    expect(text).not.toContain("Minhas provas");
  });
});

describe("a resposta de uma leitura rápida", () => {
  it("é a própria seção, escrita, com a fonte junto", () => {
    const brief = buildBrief(full());
    const answered = answerSuggestion(brief, suggestionById("semana")!)!;
    expect(answered.content).toContain("**4 de 6 sessões, 3h21**");
    expect(answered.content).toContain("- 4 sessões feitas de 6 previstas.");
    expect(answered.sources).toEqual(["plano da semana e tudo que foi registrado nela"]);
  });
});
