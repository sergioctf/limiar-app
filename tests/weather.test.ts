/**
 * O tempo na Hoje.
 *
 * Duas coisas importam: ler a resposta do Open-Meteo a partir da hora certa (é
 * fácil mostrar a previsão de ontem sem perceber) e não mandar a coordenada
 * exata de alguém para um serviço de terceiro.
 */
import { describe, expect, it } from "vitest";
import { currentSky, readForecast, roundCoord, skyKind, weatherUrl, SKY_LABEL } from "@/lib/weather";

const raw = {
  current: { temperature_2m: 23.4, apparent_temperature: 25.1, weather_code: 2 },
  hourly: {
    time: ["2026-09-20T12:00", "2026-09-20T13:00", "2026-09-20T14:00", "2026-09-20T15:00", "2026-09-20T16:00"],
    temperature_2m: [21.2, 23.4, 24.8, 24.1, 22.6],
    precipitation_probability: [0, 10, 35, 80, 15],
    weather_code: [1, 2, 3, 61, 3],
  },
};

const at = (h: number) => new Date(2026, 8, 20, h, 30);

describe("lendo a previsão", () => {
  it("arredonda o agora e a sensação", () => {
    const f = readForecast(raw, at(13))!;
    expect(f.tempC).toBe(23);
    expect(f.feelsLikeC).toBe(25);
  });

  it("começa na hora seguinte à atual, nunca no começo do dia", () => {
    const f = readForecast(raw, at(13))!;
    expect(f.next.map(h => h.label)).toEqual(["14h", "15h", "16h"]);
  });

  it("carrega a chance de chuva de cada hora", () => {
    const f = readForecast(raw, at(13))!;
    expect(f.next.find(h => h.label === "15h")).toMatchObject({ tempC: 24, rainChance: 80, code: 61 });
  });

  it("não inventa previsão quando a resposta vem vazia", () => {
    expect(readForecast({}, at(13))).toBeNull();
    expect(readForecast({ current: { temperature_2m: 20 } }, at(13))).toBeNull();
  });

  it("aguenta uma hora depois do fim da série sem quebrar", () => {
    const f = readForecast(raw, at(23))!;
    expect(f.tempC).toBe(23);
    expect(f.next).toEqual([]);
  });
});

describe("o céu, em português", () => {
  it("traduz os códigos WMO em algo que se lê", () => {
    expect(SKY_LABEL[skyKind(0)]).toBe("Céu limpo");
    expect(SKY_LABEL[skyKind(2)]).toBe("Parcialmente nublado");
    expect(SKY_LABEL[skyKind(63)]).toBe("Chuva");
    expect(SKY_LABEL[skyKind(81)]).toBe("Pancadas de chuva");
    expect(SKY_LABEL[skyKind(95)]).toBe("Trovoada");
  });

  it("um código desconhecido não vira exceção", () => {
    expect(SKY_LABEL[skyKind(999)]).toBe("Nublado");
  });
});

describe("a localização que sai do aparelho", () => {
  it("vai arredondada, porque clima não precisa do endereço de ninguém", () => {
    expect(roundCoord(-23.5612312)).toBe(-23.56);
    const url = weatherUrl(-23.5612312, -46.6543219);
    expect(url).toContain("latitude=-23.56");
    expect(url).toContain("longitude=-46.65");
    expect(url).not.toContain("-23.5612312");
  });
});

describe("o que está acontecendo agora, e não o que o modelo previu", () => {
  it("não diz chuva com o céu seco — o bug que o Sérgio viu na janela", () => {
    // Código 80 = pancadas de chuva, mas nada caindo e céu meio limpo.
    const f = readForecast({
      ...raw,
      current: { temperature_2m: 24, apparent_temperature: 25, weather_code: 80, precipitation: 0, cloud_cover: 40 },
    }, at(13))!;
    expect(SKY_LABEL[f.kind]).toBe("Parcialmente nublado");
  });

  it("céu fechado sem chuva é nublado, não pancada", () => {
    expect(currentSky({ code: 61, precipitationMm: 0, cloudCover: 95 })).toBe("nublado");
  });

  it("sem nuvem nenhuma e sem chuva, é céu limpo", () => {
    expect(currentSky({ code: 80, precipitationMm: 0, cloudCover: 5 })).toBe("limpo");
  });

  it("mas chuva medida continua sendo chuva", () => {
    expect(currentSky({ code: 80, precipitationMm: 0.4, cloudCover: 90 })).toBe("pancada");
    expect(currentSky({ code: 63, precipitationMm: 2, cloudCover: 100 })).toBe("chuva");
  });

  it("sem medida de precipitação, acredita no código", () => {
    expect(currentSky({ code: 80, precipitationMm: null, cloudCover: 30 })).toBe("pancada");
  });

  it("um dia de sol não é reinterpretado", () => {
    expect(currentSky({ code: 0, precipitationMm: 0, cloudCover: 90 })).toBe("limpo");
  });
});
