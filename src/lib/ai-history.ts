import type { Run } from "@/types";

/**
 * O histórico que cabe numa chamada.
 *
 * ## O que quebrou (13/10/2026)
 *
 * O cabeçalho de `ai.ts` dizia: *"mandamos TODAS as corridas do histórico — o
 * modelo tem janela de 128k tokens, o que comporta centenas de corridas
 * confortavelmente."* A janela comporta. **O limite por minuto não.**
 *
 * Medido na conta de produção, com as 170 corridas do Sérgio:
 *
 * ```
 * prompt_tokens: 6912 · completion: 600 · total: 7512
 * x-ratelimit-limit-tokens: 8000   (teto por minuto, plano gratuito da Groq)
 * ```
 *
 * Uma análise consome **94% do minuto inteiro**. A segunda coisa que o app
 * pedisse na mesma janela — outra análise, o conselheiro, o recado do dia —
 * voltava `429`, que `callGroq` transformava em `null`, que a rota anunciava
 * como *"AI analysis failed or API key not set"*. E piorava sozinho: o prompt
 * cresce a cada corrida registrada, então por volta de 190 corridas uma única
 * análise estoura o teto e a IA morre de vez — para o atleta que mais usa o
 * app, que foi exatamente quem percebeu.
 *
 * ## O que entra no lugar
 *
 * Despejar 170 linhas cruas também nunca foi bom treinamento de contexto: o que
 * responde *"esta corrida foi boa?"* são as corridas **parecidas** com ela e a
 * **tendência**, não a lista inteira em ordem cronológica. Então o histórico
 * vira três blocos curtos:
 *
 *   1. **Comparáveis** — mesmo tipo, distância próxima. É contra elas que a
 *      corrida de hoje é julgada.
 *   2. **Recentes** — as últimas, para a forma do momento.
 *   3. **Mês a mês** — volume, número de corridas e ritmo médio. Uma linha por
 *      mês diz a tendência de um ano inteiro melhor do que 170 linhas soltas.
 *
 * Resultado medido: de ~6.900 para ~1.100 tokens de prompt, com espaço de sobra
 * no minuto para o resto do app funcionar junto.
 */

/** Quantas corridas parecidas e quantas recentes entram nos blocos. */
export const COMPARAVEIS = 8;
export const RECENTES = 10;

/** Quão perto a distância precisa estar para a corrida servir de comparação. */
const TOLERANCIA = 0.25;

const paceStr = (sec: number | null | undefined): string =>
  sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/km` : "—";

/**
 * As corridas contra as quais esta faz sentido ser lida.
 *
 * Mesmo tipo e distância dentro de ±25%: comparar um longão de 18 km com um
 * regenerativo de 4 km não diz nada sobre nenhum dos dois. Quando o tipo não
 * tem companhia suficiente, a distância sozinha decide — é melhor comparar com
 * algo parecido de outro rótulo do que não comparar com nada.
 */
export function comparaveis(target: Run, runs: Run[], limite = COMPARAVEIS): Run[] {
  const outras = runs.filter(r => r.id !== target.id);
  const perto = (r: Run) =>
    target.distance_km > 0 &&
    Math.abs(r.distance_km - target.distance_km) / target.distance_km <= TOLERANCIA;

  const recentes = [...outras].sort((a, b) => b.date.localeCompare(a.date));
  const mesmoTipo = recentes.filter(r => r.type === target.type && perto(r));
  if (mesmoTipo.length >= limite) return mesmoTipo.slice(0, limite);

  const escolhidas = new Set(mesmoTipo.map(r => r.id));
  const soDistancia = recentes.filter(r => !escolhidas.has(r.id) && perto(r));
  return [...mesmoTipo, ...soDistancia].slice(0, limite);
}

/**
 * Mês a mês: a tendência sem a lista.
 *
 * O ritmo médio é ponderado pela distância, não a média das médias — senão um
 * tiro de 400 m pesa igual a um longão de 20 km e o mês inteiro parece mais
 * rápido do que foi.
 */
export function porMes(runs: Run[]): string[] {
  const meses = new Map<string, { n: number; km: number; segs: number; kmComPace: number }>();
  for (const r of runs) {
    const mes = r.date.slice(0, 7);
    const m = meses.get(mes) ?? { n: 0, km: 0, segs: 0, kmComPace: 0 };
    m.n   += 1;
    m.km  += r.distance_km;
    if (r.avg_pace_seconds_per_km && r.distance_km > 0) {
      m.segs      += r.avg_pace_seconds_per_km * r.distance_km;
      m.kmComPace += r.distance_km;
    }
    meses.set(mes, m);
  }
  return Array.from(meses.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, m]) => {
      const pace = m.kmComPace > 0 ? paceStr(m.segs / m.kmComPace) : "—";
      return `${mes}: ${m.n} corridas · ${m.km.toFixed(1)} km · ritmo médio ${pace}`;
    });
}

/**
 * O bloco de histórico pronto para o prompt.
 *
 * `target` é a corrida sendo analisada, quando há uma; sem ela, só recentes e
 * tendência — que é o caso do resumo semanal.
 */
export function historyDigest(
  runs: Run[],
  fmt: (r: Run) => string,
  opts: { target?: Run; excluir?: Set<string> } = {},
): string {
  const excluir = opts.excluir ?? new Set<string>();
  const pool = runs.filter(r => !excluir.has(r.id) && r.id !== opts.target?.id);
  if (pool.length === 0) return "";

  const usadas = new Set<string>();
  const partes: string[] = [];

  if (opts.target) {
    const similares = comparaveis(opts.target, pool);
    if (similares.length > 0) {
      similares.forEach(r => usadas.add(r.id));
      partes.push(
        `Corridas comparáveis (mesmo tipo e distância parecida, mais recentes primeiro):\n${similares.map(fmt).join("\n")}`,
      );
    }
  }

  const recentes = [...pool]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(r => !usadas.has(r.id))
    .slice(0, RECENTES);
  if (recentes.length > 0) {
    partes.push(`Corridas recentes:\n${recentes.map(fmt).join("\n")}`);
  }

  const meses = porMes(pool);
  if (meses.length > 1) {
    partes.push(
      `Volume mês a mês (${pool.length} corridas no total — o detalhe de cada uma não cabe numa chamada, então aqui está a tendência):\n${meses.join("\n")}`,
    );
  }

  return partes.join("\n\n");
}
