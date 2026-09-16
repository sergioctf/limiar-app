import { describe, it, expect } from "vitest";
import {
  idealCategory, suggestShoe, shoeMileage, wearOf, normalizeShoeInput,
  SHOE_META, SHOE_CATEGORIES, type Shoe,
} from "@/lib/shoes";

const shoe = (over: Partial<Shoe> & { id: string; name: string }): Shoe => ({
  category: "rodagem", initial_km: 0, retired: false, ...over,
});

const PLACA   = shoe({ id: "p", name: "Vaporfly 3",     category: "placa" });
const TEMPO   = shoe({ id: "t", name: "Endorphin Speed", category: "tempo" });
const RODAGEM = shoe({ id: "r", name: "Novablast 5",     category: "rodagem" });
const TRAIL   = shoe({ id: "x", name: "Speedgoat 6",     category: "trail" });
const ALL = [PLACA, TEMPO, RODAGEM, TRAIL];

describe("idealCategory", () => {
  it("sends races and the 3 km test to the plate", () => {
    expect(idealCategory({ type: "race" })).toBe("placa");
    expect(idealCategory({ type: "test" })).toBe("placa");
  });

  it("sends quality sessions to the tempo shoe in a normal week", () => {
    expect(idealCategory({ type: "intervals" })).toBe("tempo");
    expect(idealCategory({ type: "tempo" })).toBe("tempo");
  });

  it("sends easy running and the long run to the comfortable shoe", () => {
    expect(idealCategory({ type: "easy" })).toBe("rodagem");
    expect(idealCategory({ type: "recovery" })).toBe("rodagem");
    expect(idealCategory({ type: "long_run" })).toBe("rodagem");
  });

  it("promotes the sharpening session to the plate inside the taper", () => {
    expect(idealCategory({ type: "intervals" }, { daysToRace: 5 })).toBe("placa");
    expect(idealCategory({ type: "intervals" }, { phase: "taper" })).toBe("placa");
    // …but not the easy runs around it.
    expect(idealCategory({ type: "easy" }, { daysToRace: 5 })).toBe("rodagem");
  });

  it("does not treat a race two months out as race week", () => {
    expect(idealCategory({ type: "intervals" }, { daysToRace: 60 })).toBe("tempo");
  });

  it("has nothing to say about rest, lifting or the pool", () => {
    expect(idealCategory({ type: "rest" })).toBeNull();
    expect(idealCategory({ type: "strength", sport: "musculacao" })).toBeNull();
    expect(idealCategory({ type: "easy", sport: "natacao" })).toBeNull();
    expect(idealCategory({ type: "easy", sport: "yoga" })).toBeNull();
  });

  it("puts a trail session in trail shoes", () => {
    expect(idealCategory({ type: "easy", sport: "trilha" })).toBe("trail");
  });
});

describe("suggestShoe", () => {
  it("picks the right shoe for each kind of session", () => {
    expect(suggestShoe({ type: "race" }, ALL)?.shoe.id).toBe("p");
    expect(suggestShoe({ type: "intervals" }, ALL)?.shoe.id).toBe("t");
    expect(suggestShoe({ type: "long_run" }, ALL)?.shoe.id).toBe("r");
  });

  it("explains itself", () => {
    const s = suggestShoe({ type: "race" }, ALL);
    expect(s?.reason).toMatch(/prova/i);
    expect(s?.substitute).toBe(false);
  });

  it("returns nothing when there are no shoes, rather than inventing one", () => {
    expect(suggestShoe({ type: "easy" }, [])).toBeNull();
    expect(suggestShoe({ type: "easy" }, [{ ...RODAGEM, retired: true }])).toBeNull();
  });

  it("returns nothing for a day that is not a run", () => {
    expect(suggestShoe({ type: "rest" }, ALL)).toBeNull();
  });

  it("rotates: the freshest pair in the category wins", () => {
    const velho = shoe({ id: "a", name: "Novablast velho", initial_km: 400 });
    const novo  = shoe({ id: "b", name: "Novablast novo",  initial_km: 50 });
    expect(suggestShoe({ type: "easy" }, [velho, novo])?.shoe.id).toBe("b");
  });

  it("counts logged runs when deciding which is freshest", () => {
    const a = shoe({ id: "a", name: "A", initial_km: 100 });
    const b = shoe({ id: "b", name: "B", initial_km: 120 });
    // B starts ahead, but A has since run 50 km.
    const runs = [{ shoe_id: "a", distance_km: 30 }, { shoe_id: "a", distance_km: 20 }];
    expect(suggestShoe({ type: "easy" }, [a, b], runs)?.shoe.id).toBe("b");
  });

  it("is stable — same input, same answer", () => {
    const a = shoe({ id: "a", name: "Alfa", initial_km: 100 });
    const b = shoe({ id: "b", name: "Beta", initial_km: 100 });
    const first = suggestShoe({ type: "easy" }, [a, b])?.shoe.id;
    expect(suggestShoe({ type: "easy" }, [b, a])?.shoe.id).toBe(first);
  });

  it("substitutes when the ideal category is missing, and says so", () => {
    const s = suggestShoe({ type: "race" }, [RODAGEM]);
    expect(s?.shoe.id).toBe("r");
    expect(s?.wanted).toBe("placa");
    expect(s?.substitute).toBe(true);
    expect(s?.reason).toMatch(/não tem nenhum cadastrado/i);
  });

  it("would rather run a tiro in a trainer than burn the race shoe", () => {
    const s = suggestShoe({ type: "intervals" }, [PLACA, RODAGEM]);
    expect(s?.shoe.id).toBe("r");
  });

  it("ignores retired shoes but still finds a substitute", () => {
    const s = suggestShoe({ type: "easy" }, [{ ...RODAGEM, retired: true }, TEMPO]);
    expect(s?.shoe.id).toBe("t");
    expect(s?.substitute).toBe(true);
  });
});

describe("shoeMileage", () => {
  it("adds logged distance to what the shoe arrived with", () => {
    const runs = [
      { shoe_id: "r", distance_km: 10.5 },
      { shoe_id: "r", distance_km: 5 },
      { shoe_id: "p", distance_km: 21.1 },   // another shoe
      { shoe_id: null, distance_km: 8 },     // untagged
    ];
    expect(shoeMileage({ ...RODAGEM, initial_km: 200 }, runs)).toBe(215.5);
  });

  it("is zero for a new shoe with nothing logged", () => {
    expect(shoeMileage(RODAGEM, [])).toBe(0);
  });
});

describe("wearOf", () => {
  it("calls a plate finished far earlier than a trainer", () => {
    expect(wearOf({ ...PLACA, initial_km: 260 }, []).status).toBe("trocar");
    expect(wearOf({ ...RODAGEM, initial_km: 260 }, []).status).toBe("rodando");
  });

  it("warns before the shoe is done, not after", () => {
    const meta = SHOE_META.rodagem;
    expect(wearOf({ ...RODAGEM, initial_km: meta.lifespanKm * 0.85 }, []).status).toBe("atencao");
    expect(wearOf({ ...RODAGEM, initial_km: meta.lifespanKm * 0.5 }, []).status).toBe("rodando");
  });

  it("says how far is left while there is any", () => {
    const w = wearOf({ ...RODAGEM, initial_km: 200 }, []);
    expect(w.note).toContain(`${SHOE_META.rodagem.lifespanKm - 200}`);
    expect(w.km).toBe(200);
  });

  it("every category has a positive lifespan", () => {
    for (const c of SHOE_CATEGORIES) expect(SHOE_META[c].lifespanKm).toBeGreaterThan(0);
  });
});

describe("normalizeShoeInput", () => {
  it("requires a name", () => {
    expect(normalizeShoeInput({ name: "   " })).toBeNull();
    expect(normalizeShoeInput({})).toBeNull();
    expect(normalizeShoeInput(null)).toBeNull();
  });

  it("defaults an unknown category to the everyday shoe", () => {
    expect(normalizeShoeInput({ name: "X", category: "voador" })?.category).toBe("rodagem");
  });

  it("refuses nonsense mileage", () => {
    expect(normalizeShoeInput({ name: "X", initial_km: -50 })?.initial_km).toBe(0);
    expect(normalizeShoeInput({ name: "X", initial_km: "abc" })?.initial_km).toBe(0);
    expect(normalizeShoeInput({ name: "X", initial_km: 99999 })?.initial_km).toBe(5000);
    expect(normalizeShoeInput({ name: "X", initial_km: 123.46 })?.initial_km).toBe(123.5);
  });

  it("trims and keeps what is real", () => {
    const s = normalizeShoeInput({
      name: "  Vaporfly 3 ", brand: " Nike ", category: "placa", initial_km: 80, retired: true,
    });
    expect(s).toEqual({
      name: "Vaporfly 3", brand: "Nike", category: "placa",
      initial_km: 80, retired: true, notes: null,
    });
  });
});
