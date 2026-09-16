import { describe, it, expect } from "vitest";
import {
  toSportKey, sportCategory, isStrengthActivity, isCardioActivity,
  estimateActivityCalories, activityCalories, normalizeSports,
  ALL_SPORTS, EVERY_SPORT, SPORTS, CATEGORY_LABEL,
  SECONDARY_SPORTS,
} from "@/lib/sports";
import { buildCardioSession } from "@/lib/cardio-builder";
import { buildMacroWeeks, macroPhaseFor, assessMacroPlan, raceDemand } from "@/lib/macro-builder";
import type { CardioAddon } from "@/lib/strength-prefs";

describe("sport taxonomy", () => {
  it("counts HIIT and CrossFit as strength, per the athlete's own rule", () => {
    expect(toSportKey("HighIntensityIntervalTraining")).toBe("musculacao");
    expect(toSportKey("Crossfit")).toBe("musculacao");
    expect(isStrengthActivity("hiit")).toBe(true);
  });

  it("maps Strava's names for the four sports", () => {
    expect(toSportKey("Run")).toBe("corrida");
    expect(toSportKey("TrailRun")).toBe("corrida");
    expect(toSportKey("Ride")).toBe("ciclismo");
    expect(toSportKey("VirtualRide")).toBe("ciclismo");
    expect(toSportKey("Swim")).toBe("natacao");
    expect(toSportKey("WeightTraining")).toBe("musculacao");
  });

  it("groups running, swimming and cycling as cardio", () => {
    for (const s of ["Run", "Swim", "Ride"]) {
      expect(sportCategory(s), s).toBe("cardio");
      expect(isCardioActivity(s), s).toBe(true);
    }
    expect(sportCategory("WeightTraining")).toBe("forca");
  });

  it("returns null for things it does not know, instead of guessing", () => {
    // Kitesurf used to live here; it now classifies as 'outro'. The guarantee
    // is unchanged — genuinely unrecognisable input must stay null rather than
    // land in a bucket and quietly earn calories.
    expect(toSportKey("Xadrez")).toBeNull();
    expect(toSportKey("asdfgh")).toBeNull();
    expect(toSportKey(null)).toBeNull();
    expect(toSportKey("")).toBeNull();
  });

  it("falls back to the default sports for junk input", () => {
    expect(normalizeSports(null)).toContain("corrida");
    expect(normalizeSports(["nope"])).toContain("corrida");
    expect(normalizeSports(["corrida", "corrida"])).toEqual(["corrida"]);
  });
});

describe("calories", () => {
  it("uses the recorded value when there is one", () => {
    expect(activityCalories({ sport_type: "Run", duration_seconds: 3600, calories: 512 })).toBe(512);
  });

  it("estimates from MET × weight × hours when there is none", () => {
    // Weight training, 70 kg, one hour → 5.0 × 70 × 1 = 350 kcal.
    expect(estimateActivityCalories("WeightTraining", 3600, 70)).toBe(350);
  });

  it("scales with body weight", () => {
    const light = estimateActivityCalories("Run", 3600, 55);
    const heavy = estimateActivityCalories("Run", 3600, 95);
    expect(heavy).toBeGreaterThan(light);
  });

  it("uses a default weight rather than returning nothing", () => {
    expect(estimateActivityCalories("Run", 3600, null)).toBeGreaterThan(0);
    expect(estimateActivityCalories("Run", 3600, 0)).toBeGreaterThan(0);
  });

  it("rates HIIT above ordinary lifting", () => {
    expect(estimateActivityCalories("hiit", 3600, 70))
      .toBeGreaterThan(estimateActivityCalories("WeightTraining", 3600, 70));
  });

  it("returns zero — never NaN — when the duration is missing", () => {
    for (const d of [null, undefined, 0, -10]) {
      expect(estimateActivityCalories("Run", d, 70)).toBe(0);
    }
  });
});

describe("cardio add-ons", () => {
  const addon = (over: Partial<CardioAddon> = {}): CardioAddon => ({
    machine: "esteira", minutes: 25, position: "depois", intensity: "aerobico", ...over,
  });

  it("downgrades hard cardio done before lifting to a warm-up", () => {
    const s = buildCardioSession(addon({ position: "antes", intensity: "tempo" }), { lthr: 165 })!;
    expect(s.blocks.every(b => b.label.toLowerCase().includes("aquec") || b.minutes > 0)).toBe(true);
    expect(s.adjusted).toMatch(/aquecimento/i);
  });

  it("downgrades intervals stacked on top of a leg day", () => {
    const s = buildCardioSession(
      addon({ intensity: "intervalado" }),
      { lthr: 165, lowerBodyDay: true },
    )!;
    expect(s.adjusted).toMatch(/perna/i);
  });

  it("leaves intervals alone after an upper body day", () => {
    const s = buildCardioSession(
      addon({ intensity: "intervalado" }),
      { lthr: 165, lowerBodyDay: false },
    )!;
    expect(s.adjusted).toBeUndefined();
  });

  it("drops to recovery only during race week", () => {
    const s = buildCardioSession(addon({ intensity: "tempo" }), { lthr: 165, phase: "race" })!;
    expect(s.blocks.length).toBeGreaterThan(0);
    expect(s.adjusted).toBeTruthy();
  });

  it("anchors blocks to heart rate, since pace on an incline means nothing", () => {
    const s = buildCardioSession(addon(), { lthr: 165 })!;
    expect(s.blocks.some(b => b.hr)).toBe(true);
    for (const b of s.blocks) {
      if (!b.hr) continue;
      expect(b.hr.min).toBeLessThan(b.hr.max);
    }
  });

  it("omits heart-rate targets before the 3 km test", () => {
    const s = buildCardioSession(addon(), { lthr: null })!;
    expect(s.blocks.every(b => !b.hr)).toBe(true);
  });

  it("blocks add up to the minutes requested", () => {
    for (const minutes of [10, 25, 45]) {
      const s = buildCardioSession(addon({ minutes }), { lthr: 165 })!;
      const total = s.blocks.reduce((n, b) => n + b.minutes, 0);
      expect(total, `${minutes} min`).toBeCloseTo(minutes, 0);
    }
  });

  it("returns nothing when there is no machine or no time", () => {
    expect(buildCardioSession(addon({ machine: "nenhum" }), {})).toBeNull();
    expect(buildCardioSession(addon({ minutes: 0 }), {})).toBeNull();
  });

  it("tells the athlete how to use the stair machine", () => {
    const s = buildCardioSession(addon({ machine: "escada" }), { lthr: 165 })!;
    const text = [s.purpose, ...s.blocks.map(b => `${b.setting ?? ""} ${b.note ?? ""}`)].join(" ");
    expect(text).toMatch(/braço/i);
  });
});

describe("macro plan", () => {
  const RACE_DATE = "2026-10-04";

  /** Every Monday from `from` up to and including race week. */
  function mondaysUntil(from: string, raceDate: string): string[] {
    const out: string[] = [];
    for (const d = new Date(`${from}T12:00:00Z`); d <= new Date(`${raceDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }

  it("never plans a week after race day", () => {
    const weeks = buildMacroWeeks({
      raceDate: RACE_DATE, raceKm: 21.1, raceType: "half",
      currentWeeklyKm: 35, weekStarts: [
        "2026-08-03", "2026-08-31", "2026-09-28", "2026-10-05", "2026-10-12",
      ],
    } as Parameters<typeof buildMacroWeeks>[0]);
    for (const w of weeks) {
      expect(w.week_start <= RACE_DATE, `${w.week_start} is after the race`).toBe(true);
    }
  });

  it("ends in a taper and then the race", () => {
    expect(macroPhaseFor("2026-09-28", RACE_DATE, 12)).toBe("race");
    expect(macroPhaseFor("2026-09-21", RACE_DATE, 12)).toBe("taper");
    expect(macroPhaseFor("2026-07-06", RACE_DATE, 12)).toBe("base");
  });

  /**
   * `raceKm` only ever reached the label of the key workout, so a 5 km plan and
   * a half marathon plan produced the same volume curve. The half peaked at
   * 16 km/week and raced on a 6 km week.
   */
  it("scales the plan to the race, not just to where the athlete is", () => {
    const weekStarts = mondaysUntil("2026-08-03", RACE_DATE);
    const half = buildMacroWeeks({ raceDate: RACE_DATE, raceKm: 21.1, raceType: "half", currentWeeklyKm: 30, weekStarts } as never);
    const fiveK = buildMacroWeeks({ raceDate: RACE_DATE, raceKm: 5, raceType: "5k", currentWeeklyKm: 30, weekStarts } as never);
    const peak = (w: typeof half) => Math.max(...w.map(x => x.target_km));
    expect(peak(half)).toBeGreaterThan(peak(fiveK));
  });

  it("counts the race itself in race week", () => {
    const weekStarts = mondaysUntil("2026-08-03", RACE_DATE);
    const weeks = buildMacroWeeks({ raceDate: RACE_DATE, raceKm: 21.1, raceType: "half", currentWeeklyKm: 30, weekStarts } as never);
    const raceWeek = weeks.find(w => w.phase === "race")!;
    expect(raceWeek.target_km).toBeGreaterThanOrEqual(21);
  });

  it("still respects the 8%/week ceiling while aiming higher", () => {
    // Measured against the trend, not against consecutive weeks: coming back up
    // from a cutback week is a jump by design, and says nothing about the ramp.
    const weekStarts = mondaysUntil("2026-08-03", RACE_DATE);
    const weeks = buildMacroWeeks({ raceDate: RACE_DATE, raceKm: 42.2, raceType: "marathon", currentWeeklyKm: 20, weekStarts } as never);
    const building = weeks.filter(w => w.phase === "base" || w.phase === "build" || w.phase === "peak");

    let peak = building[0]?.target_km ?? 0;
    for (const w of building.slice(1)) {
      // +1 km of slack: targets are whole kilometres, and 21.6 → 22 reads as
      // 10% growth off a 20 km base while the ramp underneath is 8%.
      expect(w.target_km, `semana de ${w.week_start}`).toBeLessThanOrEqual(peak * 1.08 + 1);
      peak = Math.max(peak, w.target_km);
    }
  });

  it("says out loud when the race is out of reach from here", () => {
    // 10 km/week to half marathon volume in 13 weeks is not a safe build, and
    // a plan that pretends otherwise just guarantees a bad race with no warning.
    const short = assessMacroPlan({
      raceDate: RACE_DATE, raceKm: 21.1, currentWeeklyKm: 10,
      weekStarts: mondaysUntil("2026-07-06", RACE_DATE),
    } as never);
    expect(short.verdict).toBe("insuficiente");
    expect(short.weeksNeeded).toBeGreaterThan(short.weeksAvailable);
    expect(short.message).toMatch(/\d+ semanas/);

    const ready = assessMacroPlan({
      raceDate: RACE_DATE, raceKm: 21.1, currentWeeklyKm: 45,
      weekStarts: mondaysUntil("2026-07-06", RACE_DATE),
    } as never);
    expect(ready.verdict).toBe("suficiente");
  });

  it("asks more of a marathon than of a 5 km", () => {
    expect(raceDemand(42.2).peakWeeklyKm).toBeGreaterThan(raceDemand(21.1).peakWeeklyKm);
    expect(raceDemand(21.1).peakWeeklyKm).toBeGreaterThan(raceDemand(5).peakWeeklyKm);
    expect(raceDemand(21.1).longRunKm).toBeGreaterThan(15);
  });

  it("moves through the phases in order, never backwards", () => {
    const order = { base: 0, build: 1, peak: 2, taper: 3, race: 4 };
    const weeks: string[] = [];
    for (let d = new Date("2026-07-06"); d <= new Date(RACE_DATE); d.setDate(d.getDate() + 7)) {
      weeks.push(d.toISOString().slice(0, 10));
    }
    const phases = weeks.map(w => order[macroPhaseFor(w, RACE_DATE, weeks.length)]);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
  });
});

/**
 * The "Outros" bucket, built from what Strava actually sent this athlete.
 *
 * Before it existed, eleven activity types classified as nothing: they burned
 * no calories, counted towards no training day, and simply were not there. Yoga
 * and pilates were worse than absent — folded into musculação, so a restorative
 * hour was counted as resistance training and charged against recovery.
 */
describe("categoria Outros", () => {
  it("dá nome próprio a cada tipo que apareceu em produção", () => {
    // Antes caíam todos no mesmo balde. "Vôlei" e "Yoga" custam coisas
    // diferentes e significam coisas diferentes numa semana de treino —
    // mostrar os dois como "Outros" joga fora o que o atleta informou.
    const esperado: Record<string, string> = {
      Walk: "caminhada", StairStepper: "escada", Elliptical: "eliptico",
      Tennis: "tenis", Pickleball: "padel", Yoga: "yoga", Pilates: "pilates",
    };
    for (const [strava, nosso] of Object.entries(esperado)) {
      expect(toSportKey(strava), strava).toBe(nosso);
    }
  });

  it("classifica os esportes que o Sérgio pediu", () => {
    expect(toSportKey("Volleyball")).toBe("volei");
    expect(toSportKey("Yoga")).toBe("yoga");
  });

  it("testa o mais específico antes do mais geral", () => {
    // "beach tennis" contém "tennis"; ordem errada e um vira o outro.
    expect(toSportKey("Beach Tennis")).toBe("beach_tennis");
    expect(toSportKey("Tennis")).toBe("tenis");
    // Zwift continua sendo ciclismo: tirar o rolo do esporte planejável
    // removeria essas sessões do volume que monta o plano do ciclista.
    expect(toSportKey("VirtualRide")).toBe("ciclismo");
  });

  it("põe todo esporte secundário na categoria Outros", () => {
    for (const k of SECONDARY_SPORTS) {
      expect(SPORTS[k].category, k).toBe("outros");
      expect(SPORTS[k].label.length, k).toBeGreaterThan(2);
      expect(SPORTS[k].emoji.length, k).toBeGreaterThan(0);
    }
  });

  it("mantém o balde genérico para o que não tem nome", () => {
    // "Workout" continua indo para musculação — é como o Strava rotula uma
    // sessão de academia, e essa regra é anterior a este balde.
    expect(toSportKey("Golf")).toBe("outro");
    expect(toSportKey("Sailing")).toBe("outro");
  });

  it("tira yoga e pilates da musculação", () => {
    // Contavam como treino de força: séries semanais infladas e custo de
    // recuperação cobrado de uma hora restaurativa.
    expect(toSportKey("Yoga")).not.toBe("musculacao");
    expect(toSportKey("Pilates")).not.toBe("musculacao");
  });

  it("mantém os quatro principais intactos", () => {
    expect(toSportKey("Run")).toBe("corrida");
    expect(toSportKey("Ride")).toBe("ciclismo");
    expect(toSportKey("Swim")).toBe("natacao");
    expect(toSportKey("WeightTraining")).toBe("musculacao");
    expect(toSportKey("HighIntensityIntervalTraining")).toBe("musculacao");
  });

  it("nenhum secundário entra na lista de esportes planejáveis", () => {
    // O motor não periodiza vôlei nem exporta .FIT de yoga. Um secundário em
    // ALL_SPORTS viraria opção no seletor e pediria um plano de tênis.
    for (const k of SECONDARY_SPORTS) {
      expect(ALL_SPORTS as readonly string[], k).not.toContain(k);
    }
    expect(ALL_SPORTS).toHaveLength(4);
    expect(EVERY_SPORT).toHaveLength(ALL_SPORTS.length + SECONDARY_SPORTS.length);
  });

  it("tem rótulo, emoji e categoria próprios", () => {
    expect(SPORTS.outro.label).toBe("Outros");
    expect(SPORTS.volei.label).toBe("Vôlei");
    expect(SPORTS.bike_indoor.label).toBe("Bike indoor");
    expect(CATEGORY_LABEL.outros).toBe("Outros");
  });

  it("não é força nem cárdio", () => {
    // isStrengthActivity alimenta contagem de séries; isCardioActivity alimenta
    // volume aeróbico. Uma caminhada não pertence a nenhum dos dois.
    expect(isStrengthActivity("Walk")).toBe(false);
    expect(isCardioActivity("Walk")).toBe(false);
  });

  it("finalmente queima calorias", () => {
    // Uma hora de caminhada valia 0 kcal porque não classificava.
    const caminhada = estimateActivityCalories("Walk", 3600, 75);
    expect(caminhada).toBeGreaterThan(150);
    // E menos que uma hora de corrida, que é o mínimo de bom senso.
    expect(caminhada).toBeLessThan(estimateActivityCalories("Run", 3600, 75));
  });

  it("cobra custos diferentes por esporte", () => {
    // Uma hora de yoga e uma de boxe não podem valer o mesmo. Cada esporte
    // carrega seu próprio MET em vez de herdar a média do balde.
    const w = (t: string) => estimateActivityCalories(t, 3600, 75);
    expect(w("Alongamento")).toBeLessThan(w("Yoga"));
    expect(w("Yoga")).toBeLessThan(w("Walk"));
    expect(w("Walk")).toBeLessThan(w("Volleyball"));
    expect(w("Volleyball")).toBeLessThan(w("Tennis"));
    expect(w("Tennis")).toBeLessThan(w("Boxing"));
  });
});
