import { describe, it, expect } from "vitest";
import {
  compareAchievements, holdersSummary, displayName,
  type AthleteBadges,
} from "@/lib/achievement-compare";
import type { Achievement } from "@/lib/achievements";

const badge = (id: string, label = id): Achievement =>
  ({ id, label, description: `desc ${id}`, icon: "🏅", unlocked: false });

const CATALOGUE = [badge("a", "Alfa"), badge("b", "Beta"), badge("c", "Gama"), badge("d", "Delta")];

const athlete = (
  userId: string, unlocked: string[], isMe = false, name: string | null = userId,
): AthleteBadges => ({ userId, name, username: null, isMe, unlocked });

describe("standings", () => {
  it("ranks by how many badges each has", () => {
    const s = compareAchievements(CATALOGUE, [
      athlete("eu", ["a"], true),
      athlete("ana", ["a", "b", "c"]),
      athlete("bruno", ["a", "b"]),
    ]).standings;

    expect(s.map(x => x.userId)).toEqual(["ana", "bruno", "eu"]);
    expect(s.map(x => x.place)).toEqual([1, 2, 3]);
    expect(s[0].count).toBe(3);
    expect(s[0].total).toBe(4);
  });

  it("shares a place on a tie, and skips the next number", () => {
    const s = compareAchievements(CATALOGUE, [
      athlete("ana", ["a", "b"]),
      athlete("bruno", ["a", "b"]),
      athlete("carla", ["a"]),
    ]).standings;

    // Two people on two badges are both second — numbering them 1 and 2 would
    // invent a winner.
    expect(s.map(x => x.place)).toEqual([1, 1, 3]);
  });

  it("marks which row is me", () => {
    const s = compareAchievements(CATALOGUE, [
      athlete("ana", ["a", "b"]),
      athlete("eu", ["a"], true),
    ]).standings;
    expect(s.find(x => x.isMe)?.userId).toBe("eu");
  });

  it("breaks a tie by name so the order does not wobble between loads", () => {
    const grupo = [athlete("z", ["a"], false, "Zeca"), athlete("a", ["a"], false, "Ana")];
    const um = compareAchievements(CATALOGUE, grupo).standings.map(x => x.userId);
    const dois = compareAchievements(CATALOGUE, [...grupo].reverse()).standings.map(x => x.userId);
    expect(um).toEqual(dois);
    expect(um[0]).toBe("a");
  });
});

describe("rows", () => {
  const group = [
    athlete("eu", ["a", "d"], true),
    athlete("ana", ["a", "b"]),
    athlete("bruno", ["a"]),
  ];

  it("lists who holds each badge", () => {
    const { rows } = compareAchievements(CATALOGUE, group);
    const a = rows.find(r => r.achievement.id === "a")!;
    expect(a.holders.map(h => h.userId).sort()).toEqual(["ana", "bruno", "eu"]);
    expect(a.iHaveIt).toBe(true);
    expect(a.rarity).toBeCloseTo(1);
  });

  it("puts the rarest earned badge first and the unearned ones last", () => {
    const { rows } = compareAchievements(CATALOGUE, group);
    const ids = rows.map(r => r.achievement.id);

    // "b" and "d" have one holder each, "a" has three, "c" has none.
    expect(ids[ids.length - 1]).toBe("c");
    expect(ids.indexOf("a")).toBeGreaterThan(ids.indexOf("b"));
    expect(ids.indexOf("a")).toBeGreaterThan(ids.indexOf("d"));
  });

  it("computes rarity within the group", () => {
    const { rows } = compareAchievements(CATALOGUE, group);
    expect(rows.find(r => r.achievement.id === "d")!.rarity).toBeCloseTo(1 / 3);
    expect(rows.find(r => r.achievement.id === "c")!.rarity).toBe(0);
  });

  it("covers the whole catalogue, however few people are compared", () => {
    const { rows, total } = compareAchievements(CATALOGUE, [athlete("eu", [], true)]);
    expect(rows).toHaveLength(4);
    expect(total).toBe(4);
  });
});

describe("what I have and what I am missing", () => {
  const group = [
    athlete("eu", ["a", "d"], true),
    athlete("ana", ["a", "b"]),
    athlete("bruno", ["a", "b"]),
  ];

  it("finds the badges only I have", () => {
    const { onlyMine } = compareAchievements(CATALOGUE, group);
    expect(onlyMine.map(r => r.achievement.id)).toEqual(["d"]);
  });

  it("finds what friends have and I do not", () => {
    const { missing } = compareAchievements(CATALOGUE, group);
    expect(missing.map(r => r.achievement.id)).toEqual(["b"]);
  });

  it("does not list a badge nobody has as missing", () => {
    // "c" is unearned by everyone — that is not a gap, it is just unearned.
    const { missing } = compareAchievements(CATALOGUE, group);
    expect(missing.map(r => r.achievement.id)).not.toContain("c");
  });

  it("orders the gaps by how many friends already have them", () => {
    const grupo = [
      athlete("eu", [], true),
      athlete("ana", ["a", "b"]),
      athlete("bruno", ["a"]),
      athlete("carla", ["a"]),
    ];
    const { missing } = compareAchievements(CATALOGUE, grupo);
    expect(missing.map(r => r.achievement.id)).toEqual(["a", "b"]);
  });

  it("says nothing is missing for someone with everything", () => {
    const grupo = [athlete("eu", ["a", "b", "c", "d"], true), athlete("ana", ["a"])];
    expect(compareAchievements(CATALOGUE, grupo).missing).toEqual([]);
  });

  it("works for someone with no friends yet", () => {
    const solo = compareAchievements(CATALOGUE, [athlete("eu", ["a"], true)]);
    expect(solo.missing).toEqual([]);
    expect(solo.onlyMine.map(r => r.achievement.id)).toEqual(["a"]);
    expect(solo.standings).toHaveLength(1);
  });

  it("does not crash on an empty group", () => {
    const vazio = compareAchievements(CATALOGUE, []);
    expect(vazio.standings).toEqual([]);
    expect(vazio.rows).toHaveLength(4);
    expect(vazio.rows.every(r => r.rarity === 0)).toBe(true);
  });
});

describe("holdersSummary", () => {
  const row = (holders: string[], iHaveIt: boolean) => ({
    achievement: badge("x"),
    holders: holders.map(h => athlete(h, ["x"], h === "eu")),
    iHaveIt,
    rarity: 0,
  });

  it("reads naturally in every case", () => {
    expect(holdersSummary(row([], false), 4)).toBe("Ninguém ainda");
    expect(holdersSummary(row(["eu"], true), 4)).toBe("Só você");
    expect(holdersSummary(row(["eu", "ana"], true), 4)).toBe("Você e mais 1");
    expect(holdersSummary(row(["eu", "ana", "bruno"], true), 4)).toBe("Você e mais 2");
    expect(holdersSummary(row(["ana"], false), 4)).toBe("1 amigo");
    expect(holdersSummary(row(["ana", "bruno"], false), 4)).toBe("2 amigos");
  });

  it("calls out the badge everyone but me has", () => {
    expect(holdersSummary(row(["ana", "bruno", "carla"], false), 3)).toBe("Todos, menos você");
  });
});

describe("displayName", () => {
  it("prefers the name, falls back to the handle, then to a generic word", () => {
    expect(displayName({ name: "Ana Paula", username: "ana" })).toBe("Ana Paula");
    expect(displayName({ name: null, username: "ana" })).toBe("@ana");
    expect(displayName({ name: "   ", username: null })).toBe("Atleta");
  });
});
