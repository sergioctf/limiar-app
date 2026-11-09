import { describe, expect, it } from "vitest";
import {
  avisoDeSaude, JOB_EXPECTATIONS, jobHealth, problemas, resumoDaSaude, TOLERANCIA,
  type JobExpectation, type JobLastRun,
} from "@/lib/job-health";

/*
  Todo bug sério deste app falhou calado: o resumo semanal morto por meses, a
  IA quebrada por semanas, o mapa por um mês. Nenhum deles gerou exceção — o
  que faltava era saber se o trabalho aconteceu.

  Estes testes guardam a parte que faz a pergunta.
*/

const AGORA = new Date("2026-11-09T12:00:00Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();

const diario: JobExpectation[] = [{ job: "strava-sync", everyHours: 24, oQueQuebra: "corridas param" }];
const semanal: JobExpectation[] = [{ job: "weekly-plan", everyHours: 168, oQueQuebra: "semana não nasce" }];

const run = (over: Partial<JobLastRun> = {}): JobLastRun => ({
  job: "strava-sync", status: "ok", started_at: horasAtras(2), finished_at: horasAtras(2), ...over,
});

describe("o que está em silêncio", () => {
  it("rodou agora há pouco: ok", () => {
    expect(jobHealth([run()], AGORA, diario)[0].estado).toBe("ok");
  });

  it("dá folga antes de cobrar — a Vercel atrasa e o fuso embaralha", () => {
    // Diário, 30 h atrás: atrasado, mas dentro da tolerância de 2×.
    expect(jobHealth([run({ started_at: horasAtras(30), finished_at: horasAtras(30) })], AGORA, diario)[0].estado).toBe("ok");
  });

  it("passou da folga: atrasado", () => {
    const h = 24 * TOLERANCIA + 1;
    const s = jobHealth([run({ started_at: horasAtras(h), finished_at: horasAtras(h) })], AGORA, diario)[0];
    expect(s.estado).toBe("atrasado");
    expect(s.horasDesde).toBe(49);
  });

  it("nunca rodou é diferente de atrasado — e é o pior caso", () => {
    // O envio pro relógio nunca funcionou desde o primeiro dia, e ninguém viu.
    // O recibo antigo de outra tarefa é o que prova que já vigiamos tempo
    // suficiente para esta ausência significar algo (ver "o primeiro dia não
    // grita", abaixo).
    const vigiandoHaDias = [run({ job: "outra", started_at: horasAtras(24 * 10), finished_at: horasAtras(24 * 10) })];
    const s = jobHealth(vigiandoHaDias, AGORA, diario)[0];
    expect(s.estado).toBe("nunca");
    expect(s.horasDesde).toBeNull();
  });

  it("falhou é ruidoso; atrasado é o silêncio — estados separados", () => {
    const s = jobHealth([run({ status: "error", error: "Groq 429" })], AGORA, diario)[0];
    expect(s.estado).toBe("falhou");
    expect(s.detalhe).toBe("Groq 429");
  });

  it("começou e não voltou: travado", () => {
    // finished_at nulo numa execução antiga é tarefa que estourou o tempo
    // limite da Vercel — ela nunca chegou à linha que escreve o fim.
    const s = jobHealth([run({ started_at: horasAtras(5), finished_at: null })], AGORA, diario)[0];
    expect(s.estado).toBe("travado");
    expect(s.detalhe).toContain("nunca terminou");
  });

  it("recém-começada não é travada — ela ainda está rodando", () => {
    const s = jobHealth([run({ started_at: horasAtras(0.2), finished_at: null })], AGORA, diario)[0];
    expect(s.estado).toBe("ok");
  });

  it("usa a execução mais recente quando há várias", () => {
    const s = jobHealth([
      run({ started_at: horasAtras(100), finished_at: horasAtras(100), status: "error", error: "velho" }),
      run({ started_at: horasAtras(1), finished_at: horasAtras(1) }),
    ], AGORA, diario)[0];
    expect(s.estado).toBe("ok");
  });

  it("semanal tem régua própria", () => {
    const quatroDias = horasAtras(24 * 4);
    expect(jobHealth([run({ job: "weekly-plan", started_at: quatroDias, finished_at: quatroDias })], AGORA, semanal)[0].estado)
      .toBe("ok");
    const vinteDias = horasAtras(24 * 20);
    expect(jobHealth([run({ job: "weekly-plan", started_at: vinteDias, finished_at: vinteDias })], AGORA, semanal)[0].estado)
      .toBe("atrasado");
  });

  it("ignora recibo de tarefa que não está no contrato", () => {
    const antigo = run({ job: "inventado", started_at: horasAtras(24 * 10), finished_at: horasAtras(24 * 10) });
    expect(jobHealth([antigo], AGORA, diario)[0].estado).toBe("nunca");
  });
});

describe("o que a tela mostra", () => {
  it("só o que precisa de atenção — o resto é ruído", () => {
    // Vigiando há 20 dias: a ausência do semanal já é falha, não espera.
    const saude = jobHealth([
      run(),
      run({ job: "antiga", started_at: horasAtras(24 * 20), finished_at: horasAtras(24 * 20) }),
    ], AGORA, [...diario, ...semanal]);
    const ruins = problemas(saude);
    expect(ruins).toHaveLength(1);
    expect(ruins[0].job).toBe("weekly-plan");
  });

  it("uma frase para o topo", () => {
    const vigiandoHaDias = [run({ job: "antiga", started_at: horasAtras(24 * 20), finished_at: horasAtras(24 * 20) })];
    expect(resumoDaSaude(jobHealth([run()], AGORA, diario))).toContain("rodaram quando deviam");
    expect(resumoDaSaude(jobHealth(vigiandoHaDias, AGORA, diario))).toBe("1 tarefa precisa de atenção: strava-sync.");
    expect(resumoDaSaude(jobHealth(vigiandoHaDias, AGORA, [...diario, ...semanal]))).toContain("2 tarefas precisam");
  });

  it("cada tarefa diz o que o atleta perde quando ela não roda", () => {
    // Um nome de cron não significa nada para quem está lendo às pressas.
    for (const e of JOB_EXPECTATIONS) {
      expect(e.oQueQuebra.length, e.job).toBeGreaterThan(10);
    }
  });
});

describe("o contrato cobre os crons que existem", () => {
  it("todo cron do vercel.json tem expectativa escrita", () => {
    // Se alguém adicionar um cron e esquecer daqui, ele nasce invisível — que
    // é exatamente o problema que esta tabela veio resolver.
    const deVercel = [
      "weekly-plan", "race-strategy", "weekly-report", "notify-morning",
      "notify-evening", "test-reminder", "notify-advisor", "strava-sync", "wellness-sync",
    ];
    const cobertos = new Set(JOB_EXPECTATIONS.map(e => e.job));
    for (const j of deVercel) expect(cobertos.has(j), j).toBe(true);
  });
});

describe("o primeiro dia não grita", () => {
  /*
    Quando a vigilância nasce, nenhum cron semanal tem recibo. Chamar isso de
    "nunca rodou" seria mentira — e dispararia oito alarmes falsos na estreia.
    Um vigia que grita na primeira manhã é um vigia que o dono silencia na
    segunda.
  */
  const recemComecou = [run({ job: "strava-sync", started_at: horasAtras(0.5), finished_at: horasAtras(0.5) })];

  it("semanal sem recibo, com uma hora de vigilância: aguardando, não 'nunca'", () => {
    const s = jobHealth(recemComecou, AGORA, semanal)[0];
    expect(s.estado).toBe("aguardando");
    expect(s.detalhe).toContain("Ainda não deu tempo");
  });

  it("aguardando não conta como problema", () => {
    expect(problemas(jobHealth(recemComecou, AGORA, semanal))).toHaveLength(0);
    expect(avisoDeSaude(jobHealth(recemComecou, AGORA, semanal))).toBeNull();
  });

  it("passado o intervalo da tarefa, aí sim é 'nunca'", () => {
    // Vigiando há 10 dias e o cron semanal nunca deixou recibo: isso é falha.
    const antigo = [run({ job: "strava-sync", started_at: horasAtras(24 * 10), finished_at: horasAtras(24 * 10) })];
    expect(jobHealth(antigo, AGORA, semanal)[0].estado).toBe("nunca");
  });

  it("sem recibo nenhum, nada foi vigiado ainda", () => {
    expect(jobHealth([], AGORA, semanal)[0].estado).toBe("aguardando");
  });
});

describe("o aviso que sai sozinho", () => {
  it("cala quando está tudo bem — por isso pode rodar todo dia", () => {
    expect(avisoDeSaude(jobHealth([run()], AGORA, diario))).toBeNull();
  });

  it("fala do que o atleta perde, não do nome do cron", () => {
    const a = avisoDeSaude(jobHealth([run({ started_at: horasAtras(24 * 30), finished_at: horasAtras(24 * 30) })], AGORA, diario))!;
    expect(a.body).toBe("corridas param");
    expect(a.body).not.toContain("strava-sync");
  });

  it("com várias, prioriza a que nunca rodou", () => {
    const expectativas = [
      { job: "a", everyHours: 24, oQueQuebra: "quebra A" },
      { job: "b", everyHours: 24, oQueQuebra: "quebra B" },
    ];
    const runs = [
      run({ job: "a", started_at: horasAtras(24 * 30), finished_at: horasAtras(24 * 30) }),
      run({ job: "zzz", started_at: horasAtras(24 * 30), finished_at: horasAtras(24 * 30) }),
    ];
    const a = avisoDeSaude(jobHealth(runs, AGORA, expectativas))!;
    expect(a.title).toContain("2 tarefas");
    expect(a.body).toContain("quebra B");   // "b" nunca rodou
  });
});
