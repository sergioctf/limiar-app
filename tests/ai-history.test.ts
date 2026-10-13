import { describe, expect, it } from "vitest";
import { comparaveis, historyDigest, porMes, RECENTES } from "@/lib/ai-history";
import type { Run } from "@/types";

const run = (over: Partial<Run> & { id: string; date: string }): Run => ({
  user_id: "u", name: "Corrida", type: "easy", distance_km: 6,
  duration_seconds: 2160, avg_pace_seconds_per_km: 360,
  avg_hr: null, max_hr: null, elevation_gain_m: null, avg_cadence: null,
  calories: null, perceived_effort: null, conditions: null, notes: null,
  source: "manual", coach_feedback: null, deleted_at: null,
  ...over,
} as Run);

const fmt = (r: Run) => `${r.date}: ${r.distance_km} km [${r.type}]`;

describe("corridas comparáveis", () => {
  const alvo = run({ id: "alvo", date: "2026-10-13", type: "easy", distance_km: 10 });

  it("põe o mesmo tipo na frente, e corta quem está longe na distância", () => {
    const pool = [
      run({ id: "mesmo-tipo",   date: "2026-10-01", type: "easy", distance_km: 10.5 }),
      run({ id: "outro-tipo",   date: "2026-09-01", type: "long_run", distance_km: 10 }),
      run({ id: "curta-demais", date: "2026-09-15", type: "easy", distance_km: 3 }),
    ];
    // "outro-tipo" entra pelo fallback de distância (não havia oito do mesmo
    // tipo); "curta-demais" não entra de jeito nenhum.
    expect(comparaveis(alvo, pool).map(r => r.id)).toEqual(["mesmo-tipo", "outro-tipo"]);
  });

  it("ordena da mais recente para a mais antiga", () => {
    const pool = [
      run({ id: "velha", date: "2026-01-02", distance_km: 10 }),
      run({ id: "nova",  date: "2026-10-01", distance_km: 10 }),
    ];
    expect(comparaveis(alvo, pool).map(r => r.id)).toEqual(["nova", "velha"]);
  });

  it("não compara um longão de 18 km com um regenerativo de 4", () => {
    const pool = [run({ id: "curta", date: "2026-10-01", type: "easy", distance_km: 4 })];
    expect(comparaveis(run({ id: "alvo", date: "2026-10-13", distance_km: 18 }), pool)).toEqual([]);
  });

  it("aceita outro tipo quando não há companhia suficiente do mesmo", () => {
    const pool = [
      run({ id: "mesmo", date: "2026-10-01", type: "easy", distance_km: 10 }),
      run({ id: "outro", date: "2026-09-20", type: "tempo", distance_km: 9.5 }),
    ];
    // Melhor comparar com algo parecido de outro rótulo do que não comparar.
    expect(comparaveis(alvo, pool).map(r => r.id)).toEqual(["mesmo", "outro"]);
  });

  it("nunca inclui a própria corrida", () => {
    expect(comparaveis(alvo, [alvo]).map(r => r.id)).toEqual([]);
  });

  it("respeita o limite", () => {
    const pool = Array.from({ length: 20 }, (_, i) =>
      run({ id: `r${i}`, date: `2026-09-${String(i + 1).padStart(2, "0")}`, distance_km: 10 }));
    expect(comparaveis(alvo, pool, 3)).toHaveLength(3);
  });

  it("uma corrida sem distância não arrasta o histórico inteiro para a comparação", () => {
    const pool = [run({ id: "a", date: "2026-10-01", distance_km: 10 })];
    expect(comparaveis(run({ id: "z", date: "2026-10-13", distance_km: 0 }), pool)).toEqual([]);
  });
});

describe("tendência mês a mês", () => {
  it("resume volume, quantidade e ritmo por mês, do mais antigo para o mais novo", () => {
    const linhas = porMes([
      run({ id: "a", date: "2026-08-05", distance_km: 10, avg_pace_seconds_per_km: 360 }),
      run({ id: "b", date: "2026-08-20", distance_km: 10, avg_pace_seconds_per_km: 300 }),
      run({ id: "c", date: "2026-09-02", distance_km: 5,  avg_pace_seconds_per_km: 330 }),
    ]);
    expect(linhas[0]).toBe("2026-08: 2 corridas · 20.0 km · ritmo médio 5:30/km");
    expect(linhas[1]).toBe("2026-09: 1 corridas · 5.0 km · ritmo médio 5:30/km");
  });

  it("pondera o ritmo pela distância — um tiro de 400 m não acelera o mês inteiro", () => {
    const [linha] = porMes([
      run({ id: "longao", date: "2026-08-01", distance_km: 20, avg_pace_seconds_per_km: 360 }),
      run({ id: "tiro",   date: "2026-08-02", distance_km: 0.4, avg_pace_seconds_per_km: 200 }),
    ]);
    // Média simples daria 4:40/km; ponderada fica praticamente no ritmo do longão.
    expect(linha).toContain("5:57/km");
  });

  it("não inventa ritmo para um mês sem nenhum registrado", () => {
    expect(porMes([run({ id: "a", date: "2026-08-01", avg_pace_seconds_per_km: null })])[0])
      .toContain("ritmo médio —");
  });
});

describe("o bloco que vai no prompt", () => {
  // 170 corridas: o tamanho real que estourou o limite por minuto da Groq.
  const historico = Array.from({ length: 170 }, (_, i) => {
    const dia = new Date(2026, 0, 1 + i);
    return run({ id: `r${i}`, date: dia.toISOString().slice(0, 10), distance_km: 6 + (i % 7) });
  });
  const alvo = run({ id: "alvo", date: "2026-10-13", distance_km: 10 });

  it("cabe numa chamada: o despejo cru era quase dez vezes maior", () => {
    const digest = historyDigest(historico, fmt, { target: alvo });
    const cru = historico.map(fmt).join("\n");
    expect(digest.length).toBeLessThan(cru.length / 3);
  });

  it("traz comparáveis, recentes e tendência", () => {
    const digest = historyDigest(historico, fmt, { target: alvo });
    expect(digest).toContain("Corridas comparáveis");
    expect(digest).toContain("Corridas recentes");
    expect(digest).toContain("Volume mês a mês");
  });

  it("diz quantas corridas existem, para a IA não concluir que o atleta só correu vinte vezes", () => {
    expect(historyDigest(historico, fmt, { target: alvo })).toContain("170 corridas no total");
  });

  it("não repete nos recentes o que já foi listado como comparável", () => {
    const digest = historyDigest(historico, fmt, { target: alvo });
    for (const linha of digest.split("\n").filter(l => l.includes(" km ["))) {
      expect(digest.split(linha).length - 1).toBe(1);
    }
  });

  it("sem corrida-alvo, traz só recentes e tendência — é o caso do resumo semanal", () => {
    const digest = historyDigest(historico, fmt);
    expect(digest).not.toContain("Corridas comparáveis");
    expect(digest).toContain("Corridas recentes");
  });

  it("respeita o que o chamador já mostrou em outro bloco", () => {
    const excluir = new Set(historico.slice(-5).map(r => r.id));
    const digest = historyDigest(historico, fmt, { excluir });
    for (const r of historico.slice(-5)) expect(digest).not.toContain(`${r.date}:`);
  });

  it("histórico vazio não vira um cabeçalho solto", () => {
    expect(historyDigest([], fmt, { target: alvo })).toBe("");
    expect(historyDigest([alvo], fmt, { target: alvo })).toBe("");
  });

  it("com poucas corridas, lista todas sem bloco de tendência", () => {
    const poucas = [
      run({ id: "a", date: "2026-10-01" }),
      run({ id: "b", date: "2026-10-05" }),
    ];
    const digest = historyDigest(poucas, fmt);
    expect(digest).toContain("2026-10-01");
    expect(digest).toContain("2026-10-05");
    expect(digest).not.toContain("Volume mês a mês");
  });

  it("não lista mais recentes do que o limite", () => {
    const digest = historyDigest(historico, fmt);
    const bloco = digest.split("Corridas recentes:\n")[1].split("\n\n")[0];
    expect(bloco.split("\n")).toHaveLength(RECENTES);
  });
});
