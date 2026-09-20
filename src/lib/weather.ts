/**
 * O tempo, para quem vai sair para correr.
 *
 * Pedido do Sérgio (20/09): temperatura e condição agora e nas próximas horas,
 * logo abaixo do "Boa noite, Sérgio". Quem treina de manhã ou no fim da tarde
 * decide roupa, hidratação e até a hora do treino por isso.
 *
 * Fonte: Open-Meteo — sem chave de API, sem cadastro, sem cota para uso
 * pessoal. As coordenadas saem do navegador e vão **arredondadas para duas
 * casas** (~1 km): é precisão de sobra para o clima e evita mandar o endereço
 * exato de alguém para um serviço de terceiro.
 *
 * Este módulo é puro — a tradução dos códigos e a leitura da resposta. Quem
 * busca é o componente (`WeatherNow`).
 */

export interface WeatherHour {
  /** "15h" */
  label: string;
  tempC: number;
  /** 0–100, quando a previsão traz. */
  rainChance: number | null;
  code: number;
}

export interface WeatherNow {
  tempC: number;
  feelsLikeC: number | null;
  code: number;
  /** As próximas horas, a partir da atual. */
  next: WeatherHour[];
}

/** Códigos WMO, agrupados como gente fala. */
export type SkyKind =
  | "limpo" | "poucas_nuvens" | "nublado" | "nevoa"
  | "garoa" | "chuva" | "pancada" | "trovoada" | "neve";

export function skyKind(code: number): SkyKind {
  if (code === 0) return "limpo";
  if (code === 1 || code === 2) return "poucas_nuvens";
  if (code === 3) return "nublado";
  if (code === 45 || code === 48) return "nevoa";
  if (code >= 51 && code <= 57) return "garoa";
  if (code >= 61 && code <= 67) return "chuva";
  if (code >= 71 && code <= 77) return "neve";
  if (code >= 80 && code <= 82) return "pancada";
  if (code === 85 || code === 86) return "neve";
  // Faixa fechada: um código que não existe não pode virar trovoada.
  if (code >= 95 && code <= 99) return "trovoada";
  return "nublado";
}

export const SKY_LABEL: Record<SkyKind, string> = {
  limpo: "Céu limpo",
  poucas_nuvens: "Parcialmente nublado",
  nublado: "Nublado",
  nevoa: "Névoa",
  garoa: "Garoa",
  chuva: "Chuva",
  pancada: "Pancadas de chuva",
  trovoada: "Trovoada",
  neve: "Neve",
};

/** Duas casas decimais: ~1 km, o suficiente para o clima. */
export function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

export function weatherUrl(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: String(roundCoord(lat)),
    longitude: String(roundCoord(lon)),
    current: "temperature_2m,apparent_temperature,weather_code",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    forecast_days: "2",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/**
 * Lê a resposta do Open-Meteo, a partir da hora atual.
 *
 * `hours` é quantas horas à frente mostrar. Devolve null quando a resposta não
 * traz o mínimo — melhor não mostrar nada do que mostrar um traço.
 */
export function readForecast(raw: Raw, now: Date = new Date(), hours = 6): WeatherNow | null {
  const cur = raw?.current;
  const h = raw?.hourly;
  if (cur?.temperature_2m == null || !Array.isArray(h?.time)) return null;

  /*
   * O Open-Meteo devolve as horas no fuso do ponto ("2026-09-20T15:00"), sem
   * offset. Comparar com o relógio do navegador exige montar a mesma string
   * local, e não um Date — um `new Date("…T15:00")` seria interpretado como
   * local do dispositivo, que pode estar em outro fuso.
   */
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
  const start = (h.time as string[]).findIndex(t => t >= nowKey);

  /*
   * Nenhuma hora futura na série: a lista das "próximas horas" fica vazia.
   *
   * Voltar ao índice 0 era o caminho fácil e mostrava a previsão da manhã como
   * se fosse o que vem por aí — errado de um jeito que ninguém percebe olhando.
   */
  const next: WeatherHour[] = [];
  for (let i = start + 1; start >= 0 && i < Math.min(start + 1 + hours, h.time.length); i++) {
    const t = h.time[i] as string;
    const temp = h.temperature_2m?.[i];
    if (temp == null) continue;
    next.push({
      label: `${Number(t.slice(11, 13))}h`,
      tempC: Math.round(temp),
      rainChance: h.precipitation_probability?.[i] ?? null,
      code: Number(h.weather_code?.[i] ?? cur.weather_code ?? 0),
    });
  }

  return {
    tempC: Math.round(cur.temperature_2m),
    feelsLikeC: cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null,
    code: Number(cur.weather_code ?? 0),
    next,
  };
}
