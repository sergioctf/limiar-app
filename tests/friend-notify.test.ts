import { describe, it, expect, vi } from "vitest";
import {
  notifyFriendsOfWorkout, notifyFriendRequest, notifyFriendAccepted,
  acceptedFriendIds, describeWorkout, firstName,
} from "@/lib/friend-notify";

/**
 * A stand-in for the admin Supabase client, with just enough surface for this
 * module: friendships, profiles, mutes, and a notices table whose primary key
 * actually rejects duplicates — which is the behaviour the throttle rests on.
 */
function fakeDb(opts: {
  friendships?: Array<{ requester_id: string; addressee_id: string; status: string }>;
  profiles?: Record<string, { name?: string | null; username?: string | null; notification_prefs?: unknown }>;
  mutes?: Array<{ user_id: string; friend_id: string }>;
} = {}) {
  const friendships = opts.friendships ?? [];
  const profiles    = opts.profiles ?? {};
  const mutes       = opts.mutes ?? [];
  const notices     = new Set<string>();

  return {
    notices,
    from(table: string) {
      if (table === "friendships") {
        return {
          select: () => ({
            eq: (_c: string, status: string) => ({
              or: (expr: string) => {
                const id = expr.match(/requester_id\.eq\.([^,]+)/)![1];
                return {
                  data: friendships.filter(f =>
                    f.status === status && (f.requester_id === id || f.addressee_id === id)),
                };
              },
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              single: () => ({ data: profiles[id] ?? null }),
            }),
            // Batch read of every recipient's notification preferences.
            in: (_c: string, ids: string[]) => ({
              data: ids.map(id => ({ id, notification_prefs: profiles[id]?.notification_prefs ?? null })),
            }),
          }),
        };
      }
      if (table === "friend_mutes") {
        return {
          select: () => ({
            eq: (_c: string, friendId: string) => ({
              data: mutes.filter(m => m.friend_id === friendId),
            }),
          }),
        };
      }
      if (table === "friend_workout_notices") {
        return {
          insert: (row: { user_id: string; friend_id: string; date: string }) => {
            const key = `${row.user_id}|${row.friend_id}|${row.date}`;
            if (notices.has(key)) return { error: { message: "duplicate key" } };
            notices.add(key);
            return { error: null };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

const ANA = "ana", BRUNO = "bruno", CARLA = "carla";

const friendsOf = (id: string, others: string[]) =>
  others.map(o => ({ requester_id: id, addressee_id: o, status: "accepted" }));

const HOJE = "2026-08-10";
const workout = { label: "Corrida matinal", distanceKm: 8.24, date: "2026-08-10" };

describe("acceptedFriendIds", () => {
  it("finds friends in both directions", async () => {
    const db = fakeDb({
      friendships: [
        { requester_id: ANA,   addressee_id: BRUNO, status: "accepted" },
        { requester_id: CARLA, addressee_id: ANA,   status: "accepted" },
      ],
    });
    expect((await acceptedFriendIds(db, ANA)).sort()).toEqual([BRUNO, CARLA]);
  });

  it("ignores pending requests", async () => {
    const db = fakeDb({
      friendships: [{ requester_id: ANA, addressee_id: BRUNO, status: "pending" }],
    });
    expect(await acceptedFriendIds(db, ANA)).toEqual([]);
  });
});

describe("describeWorkout", () => {
  it("prefers distance and writes it the Portuguese way", () => {
    expect(describeWorkout({ label: "Corrida", distanceKm: 8.24, date: "x" }))
      .toBe("Corrida · 8,2 km");
  });

  it("falls back to duration when there is no distance", () => {
    expect(describeWorkout({ label: "Musculação", durationMin: 47.4, date: "x" }))
      .toBe("Musculação · 47 min");
  });

  it("says just the label when it knows nothing else", () => {
    expect(describeWorkout({ label: "Yoga", distanceKm: 0, durationMin: 0, date: "x" }))
      .toBe("Yoga");
  });
});

describe("firstName", () => {
  it("keeps only the first name", () => {
    expect(firstName("Sérgio Carmelo")).toBe("Sérgio");
    expect(firstName("  Ana  Paula ")).toBe("Ana");
  });

  it("survives a missing name", () => {
    expect(firstName(null)).toBe("");
    expect(firstName(undefined)).toBe("");
  });
});

describe("notifyFriendsOfWorkout", () => {
  it("tells every accepted friend, once", async () => {
    const db = fakeDb({
      friendships: friendsOf(ANA, [BRUNO, CARLA]),
      profiles: { [ANA]: { name: "Ana Paula" } },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await notifyFriendsOfWorkout(db, ANA, workout, send, HOJE);

    expect(res.notified).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1].title).toBe("Ana treinou");
    expect(send.mock.calls[0][1].body).toBe("Corrida matinal · 8,2 km");
    expect(send.mock.calls[0][1].url).toBe("/friends");
  });

  it("skips friends who muted this athlete", async () => {
    const db = fakeDb({
      friendships: friendsOf(ANA, [BRUNO, CARLA]),
      profiles: { [ANA]: { name: "Ana" } },
      mutes: [{ user_id: BRUNO, friend_id: ANA }],
    });
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await notifyFriendsOfWorkout(db, ANA, workout, send, HOJE);

    expect(res.notified).toBe(1);
    expect(res.skipped).toBe(1);
    expect(send.mock.calls.map(c => c[0])).toEqual([CARLA]);
  });

  it("skips friends who turned friend workouts off in settings", async () => {
    const db = fakeDb({
      friendships: friendsOf(ANA, [BRUNO, CARLA]),
      profiles: {
        [ANA]:   { name: "Ana" },
        [BRUNO]: { notification_prefs: { friendWorkouts: false } },
      },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await notifyFriendsOfWorkout(db, ANA, workout, send, HOJE);

    expect(res.notified).toBe(1);
    expect(send.mock.calls.map(c => c[0])).toEqual([CARLA]);
  });

  it("turning off friend workouts does not silence friend requests", async () => {
    const db = fakeDb({
      profiles: {
        [ANA]:   { name: "Ana" },
        [BRUNO]: { notification_prefs: { friendWorkouts: false } },
      },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    expect(await notifyFriendRequest(db, ANA, BRUNO, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("respects someone who turned friend requests off", async () => {
    const db = fakeDb({
      profiles: {
        [ANA]:   { name: "Ana" },
        [BRUNO]: { notification_prefs: { friendRequests: false } },
      },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    expect(await notifyFriendRequest(db, ANA, BRUNO, send)).toBe(false);
    expect(await notifyFriendAccepted(db, ANA, BRUNO, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("a mute is one-directional", async () => {
    // Bruno muted Ana. Ana must still hear about Bruno.
    const db = fakeDb({
      friendships: [{ requester_id: ANA, addressee_id: BRUNO, status: "accepted" }],
      profiles: { [BRUNO]: { name: "Bruno" } },
      mutes: [{ user_id: BRUNO, friend_id: ANA }],
    });
    const send = vi.fn().mockResolvedValue(undefined);

    expect((await notifyFriendsOfWorkout(db, BRUNO, workout, send, HOJE)).notified).toBe(1);
  });

  it("announces an athlete at most once a day, however many times it is called", async () => {
    // The same run arrives via the webhook, the nightly sync and a manual entry.
    const db = fakeDb({
      friendships: friendsOf(ANA, [BRUNO]),
      profiles: { [ANA]: { name: "Ana" } },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyFriendsOfWorkout(db, ANA, workout, send, HOJE);
    await notifyFriendsOfWorkout(db, ANA, { ...workout, label: "Musculação" }, send, HOJE);
    await notifyFriendsOfWorkout(db, ANA, { ...workout, label: "Pedal" }, send, HOJE);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("but does announce again the next day", async () => {
    const db = fakeDb({
      friendships: friendsOf(ANA, [BRUNO]),
      profiles: { [ANA]: { name: "Ana" } },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyFriendsOfWorkout(db, ANA, workout, send, HOJE);
    await notifyFriendsOfWorkout(db, ANA, { ...workout, date: "2026-08-11" }, send, "2026-08-11");

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stays silent about a workout that is not from today", async () => {
    /*
     * The case this exists for: connecting Strava backfills months of history,
     * and the nightly catch-up re-imports whatever the webhook missed. Neither
     * is news, and both used to be a phone full of a friend's runs from March.
     */
    const db = fakeDb({
      friendships: friendsOf(ANA, [BRUNO]),
      profiles: { [ANA]: { name: "Ana" } },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await notifyFriendsOfWorkout(db, ANA, { ...workout, date: "2026-03-02" }, send, HOJE);

    expect(res.notified).toBe(0);
    expect(send).not.toHaveBeenCalled();
    // Nothing recorded either — tomorrow's real workout must still get through.
    expect(db.notices.size).toBe(0);
  });

  it("does nothing for someone with no friends", async () => {
    const send = vi.fn();
    expect(await notifyFriendsOfWorkout(fakeDb(), ANA, workout, send, HOJE))
      .toEqual({ notified: 0, skipped: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to a generic name rather than saying 'undefined treinou'", async () => {
    const db = fakeDb({
      friendships: friendsOf(ANA, [BRUNO]),
      profiles: { [ANA]: { name: null } },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyFriendsOfWorkout(db, ANA, workout, send, HOJE);
    expect(send.mock.calls[0][1].title).toBe("Um amigo treinou");
  });

  it("never throws — the workout is saved either way", async () => {
    const broken = { from: () => { throw new Error("banco fora do ar"); } };
    await expect(notifyFriendsOfWorkout(broken, ANA, workout, vi.fn(), HOJE))
      .resolves.toEqual({ notified: 0, skipped: 0 });
  });
});

describe("friend request notifications", () => {
  it("names the requester", async () => {
    const db = fakeDb({ profiles: { [ANA]: { name: "Ana Paula", username: "ana" } } });
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyFriendRequest(db, ANA, BRUNO, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(BRUNO);
    expect(send.mock.calls[0][1].title).toBe("Novo pedido de amizade");
    expect(send.mock.calls[0][1].body).toContain("Ana");
  });

  it("uses the username when there is no name", async () => {
    const db = fakeDb({ profiles: { [ANA]: { name: null, username: "ana" } } });
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyFriendRequest(db, ANA, BRUNO, send);
    expect(send.mock.calls[0][1].body).toContain("@ana");
  });

  it("tags per requester, so two people do not overwrite each other", async () => {
    const db = fakeDb({ profiles: { [ANA]: { name: "Ana" }, [CARLA]: { name: "Carla" } } });
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyFriendRequest(db, ANA, BRUNO, send);
    await notifyFriendRequest(db, CARLA, BRUNO, send);

    expect(send.mock.calls[0][1].tag).not.toBe(send.mock.calls[1][1].tag);
  });

  it("tells the requester when the request is accepted", async () => {
    const db = fakeDb({ profiles: { [BRUNO]: { name: "Bruno Silva" } } });
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyFriendAccepted(db, BRUNO, ANA, send);

    expect(send.mock.calls[0][0]).toBe(ANA);
    expect(send.mock.calls[0][1].title).toBe("Pedido aceito");
    expect(send.mock.calls[0][1].body).toContain("Bruno");
  });
});
