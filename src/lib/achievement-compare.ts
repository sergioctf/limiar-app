/**
 * Achievements, compared.
 *
 * A badge nobody else can see is a checkbox. The whole reason to collect them
 * is that someone else has one you don't — so the app has to be able to answer
 * "who else has this?" and "what am I missing?", and until now it could answer
 * neither.
 *
 * `detectAchievements` is a pure function of an athlete's runs, so a friend's
 * badges are derivable from data the friends pages already load. Nothing is
 * stored: a comparison computed on read cannot go stale, and cannot disagree
 * with the badge grid on the same screen.
 */
import type { Achievement } from "@/lib/achievements";

export interface AthleteBadges {
  userId:   string;
  name:     string | null;
  username: string | null;
  isMe:     boolean;
  /** Ids of the achievements this athlete has unlocked. */
  unlocked: string[];
}

export interface ComparedAchievement {
  achievement: Achievement;
  /** Everyone in the group who has it, me included. */
  holders:     AthleteBadges[];
  iHaveIt:     boolean;
  /** 0–1. Lower is rarer within this group. */
  rarity:      number;
}

export interface Standing {
  userId:   string;
  name:     string | null;
  username: string | null;
  isMe:     boolean;
  count:    number;
  total:    number;
  /** Position, sharing a place on a tie. */
  place:    number;
}

export interface AchievementComparison {
  standings: Standing[];
  /** Every achievement, rarest first among those somebody has. */
  rows:      ComparedAchievement[];
  /** Unlocked by me and by nobody else here. */
  onlyMine:  ComparedAchievement[];
  /** Unlocked by at least one friend and not by me — the interesting list. */
  missing:   ComparedAchievement[];
  total:     number;
}

export function compareAchievements(
  /** Every achievement in the catalogue, in display order. */
  catalogue: Achievement[],
  group: AthleteBadges[],
): AchievementComparison {
  const me = group.find(a => a.isMe) ?? null;
  const mine = new Set(me?.unlocked ?? []);

  const rows: ComparedAchievement[] = catalogue.map(achievement => {
    const holders = group.filter(a => a.unlocked.includes(achievement.id));
    return {
      achievement,
      holders,
      iHaveIt: mine.has(achievement.id),
      rarity: group.length > 0 ? holders.length / group.length : 0,
    };
  });

  return {
    standings: standingsOf(group, catalogue.length),
    // Rarest first, but only among badges somebody actually has: an achievement
    // nobody in the group has unlocked is not "rare", it is just unearned, and
    // leading with a wall of those buries the one thing a friend beat you to.
    rows: [...rows].sort((a, b) =>
      (b.holders.length > 0 ? 1 : 0) - (a.holders.length > 0 ? 1 : 0)
      || a.holders.length - b.holders.length
      || a.achievement.label.localeCompare(b.achievement.label, "pt-BR")),
    onlyMine: rows.filter(r => r.iHaveIt && r.holders.length === 1),
    missing:  rows.filter(r => !r.iHaveIt && r.holders.length > 0)
      // Most friends have it → the most conspicuous gap first.
      .sort((a, b) => b.holders.length - a.holders.length),
    total: catalogue.length,
  };
}

function standingsOf(group: AthleteBadges[], total: number): Standing[] {
  const sorted = [...group].sort((a, b) =>
    b.unlocked.length - a.unlocked.length
    || displayName(a).localeCompare(displayName(b), "pt-BR"));

  let place = 0;
  let lastCount = -1;
  return sorted.map((a, i) => {
    // Ties share a place: two people on 12 badges are both second, and the next
    // one down is fourth. Numbering them 2 and 3 would invent a winner.
    if (a.unlocked.length !== lastCount) { place = i + 1; lastCount = a.unlocked.length; }
    return {
      userId: a.userId, name: a.name, username: a.username, isMe: a.isMe,
      count: a.unlocked.length, total, place,
    };
  });
}

export function displayName(a: { name: string | null; username: string | null }): string {
  return a.name?.trim() || (a.username ? `@${a.username}` : "Atleta");
}

/** "Só você", "Você e mais 2", "3 de 4 amigos" — how a row reads at a glance. */
export function holdersSummary(row: ComparedAchievement, groupSize: number): string {
  const n = row.holders.length;
  if (n === 0) return "Ninguém ainda";
  if (row.iHaveIt && n === 1) return "Só você";
  if (row.iHaveIt) return n === 2 ? "Você e mais 1" : `Você e mais ${n - 1}`;
  if (n === groupSize) return "Todos, menos você";
  return n === 1 ? "1 amigo" : `${n} amigos`;
}
