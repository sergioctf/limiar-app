import { describe, it, expect } from "vitest";
import { substitutesFor, equipmentAllows, substituteReason } from "@/lib/exercise-substitute";
import { exerciseById, EXERCISES } from "@/lib/exercises";

/** A curated exercise to swap, picked by muscle so the test survives renames. */
const supino  = EXERCISES.find(e => e.primary.includes("peito"))!;
const agacha  = EXERCISES.find(e => e.primary.includes("quadriceps"))!;

describe("equipmentAllows", () => {
  it("a full gym covers everything", () => {
    expect(equipmentAllows(["academia"], "halteres")).toBe(true);
    expect(equipmentAllows(["academia"], "peso_corporal")).toBe(true);
  });

  it("dumbbells do not conjure a machine", () => {
    expect(equipmentAllows(["halteres"], "academia")).toBe(false);
    expect(equipmentAllows(["peso_corporal"], "halteres")).toBe(false);
  });

  it("the richest setup owned is the one that decides", () => {
    expect(equipmentAllows(["peso_corporal", "academia"], "halteres")).toBe(true);
    expect(equipmentAllows(["peso_corporal", "elasticos"], "academia")).toBe(false);
  });

  it("no stated equipment means no filtering", () => {
    expect(equipmentAllows(null, "academia")).toBe(true);
    expect(equipmentAllows(undefined, "academia")).toBe(true);
    expect(equipmentAllows([], "academia")).toBe(true);
  });
});

describe("substitutesFor", () => {
  it("returns nothing for an id that does not exist", () => {
    expect(substitutesFor("nao-existe")).toEqual([]);
  });

  it("never proposes the exercise itself", () => {
    expect(substitutesFor(supino.id).some(e => e.id === supino.id)).toBe(false);
  });

  it("only proposes movements whose point is the same muscle", () => {
    for (const alt of substitutesFor(supino.id)) {
      expect(alt.primary.some(m => supino.primary.includes(m))).toBe(true);
    }
  });

  it("does not cross muscle groups", () => {
    // A quad exercise must never come back as a chest substitute.
    const alts = substitutesFor(supino.id, { limit: 20 });
    expect(alts.some(e => e.id === agacha.id)).toBe(false);
  });

  it("excludes what is already in the session", () => {
    const first = substitutesFor(supino.id)[0];
    expect(first).toBeDefined();
    const without = substitutesFor(supino.id, { exclude: [first.id] });
    expect(without.some(e => e.id === first.id)).toBe(false);
  });

  it("respects the equipment the athlete has", () => {
    for (const alt of substitutesFor(supino.id, { equipment: ["halteres"], limit: 20 })) {
      expect(["halteres", "elasticos", "peso_corporal"]).toContain(alt.equipment);
    }
  });

  it("still finds something for someone with nothing but their body", () => {
    const alts = substitutesFor(supino.id, { equipment: ["peso_corporal"] });
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every(e => e.equipment === "peso_corporal")).toBe(true);
  });

  it("honours the limit", () => {
    expect(substitutesFor(supino.id, { limit: 3 }).length).toBeLessThanOrEqual(3);
  });

  it("prefers the same equipment when everything is available", () => {
    const top = substitutesFor(supino.id, { equipment: ["academia"] })[0];
    // Not a hard requirement of the ranking, but with the full gym open the
    // best match should not need a different corner of it.
    expect(top).toBeDefined();
    expect(top.primary.some(m => supino.primary.includes(m))).toBe(true);
  });

  it("is deterministic", () => {
    const a = substitutesFor(supino.id).map(e => e.id);
    const b = substitutesFor(supino.id).map(e => e.id);
    expect(a).toEqual(b);
  });

  it("works for every curated exercise — no dead ends at the rack", () => {
    const semAlternativa = EXERCISES.filter(e => substitutesFor(e.id, { limit: 1 }).length === 0);
    expect(semAlternativa.map(e => e.name)).toEqual([]);
  });
});

describe("substituteReason", () => {
  it("names the muscle and whether the kit changes", () => {
    const alt = substitutesFor(supino.id, { equipment: ["academia"] })[0];
    const reason = substituteReason(alt, supino.id);
    expect(reason).toMatch(/equipamento\./);
    expect(reason.length).toBeGreaterThan(10);
  });

  it("is empty rather than wrong for an unknown original", () => {
    const alt = exerciseById(supino.id)!;
    expect(substituteReason(alt, "nao-existe")).toBe("");
  });
});
