/**
 * Telling people what their friends are up to, without becoming noise.
 *
 * Three rules, and they are the whole design:
 *
 *   1. Only accepted friendships. A pending request is not a relationship.
 *   2. Muted friends are skipped. Someone who trains twice a day should be
 *      followable without owning your lock screen.
 *   3. At most one notification per friend, per athlete, per day. This is also
 *      what makes the feature safe to call from three different import paths:
 *      the Strava webhook, the nightly sync and a manual entry all announce the
 *      same run, and only the first one through gets to send it.
 *
 * Everything here is best-effort. A push that fails is a push that fails — it
 * must never take an activity import down with it.
 */

import { athleteDateStr } from "@/lib/week";
import { wantsNotification } from "@/lib/notification-prefs";

/** The bits of the admin Supabase client this module uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface FriendWorkout {
  /** "Corrida matinal", "Musculação" — what to call it. */
  label:        string;
  distanceKm?:  number | null;
  durationMin?: number | null;
  /** The athlete's local date (YYYY-MM-DD) — the throttle key. */
  date:         string;
}

/** Ids of everyone whose friendship with `userId` is accepted. */
export async function acceptedFriendIds(db: Db, userId: string): Promise<string[]> {
  const { data } = await db
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  return (data ?? []).map((f: { requester_id: string; addressee_id: string }) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id);
}

/**
 * One line describing a workout, short enough for a lock screen.
 *
 * Distance wins over duration when both exist: "8,2 km" says more about a run
 * than "47 min", and a lifting session has no distance to report anyway.
 */
export function describeWorkout(w: FriendWorkout): string {
  if (w.distanceKm != null && w.distanceKm > 0) {
    return `${w.label} · ${w.distanceKm.toFixed(1).replace(".", ",")} km`;
  }
  if (w.durationMin != null && w.durationMin > 0) {
    return `${w.label} · ${Math.round(w.durationMin)} min`;
  }
  return w.label;
}

/**
 * Announce `athleteId`'s workout to their friends.
 *
 * Returns how many were notified, for logging. Never throws: callers are import
 * paths whose real job is to store the activity.
 */
export async function notifyFriendsOfWorkout(
  db: Db,
  athleteId: string,
  workout: FriendWorkout,
  /** Injected so this module does not drag the web-push runtime into tests. */
  send: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<unknown>,
  /** Overridable for tests; defaults to today on the athlete's calendar. */
  today: string = athleteDateStr(),
): Promise<{ notified: number; skipped: number }> {
  try {
    /*
     * Only today's workouts are announced.
     *
     * The rule lives here rather than at each call site because there are four
     * of them, and the ones that matter are the ones nobody thinks about: a
     * first-time Strava connection backfills months of history, and the nightly
     * catch-up sync re-imports whatever the webhook missed. Both would have
     * announced a friend's runs from last March.
     */
    if (workout.date !== today) return { notified: 0, skipped: 0 };

    const friends = await acceptedFriendIds(db, athleteId);
    if (friends.length === 0) return { notified: 0, skipped: 0 };

    const [{ data: profile }, { data: mutes }, { data: recipients }] = await Promise.all([
      db.from("profiles").select("name").eq("id", athleteId).single(),
      db.from("friend_mutes").select("user_id").eq("friend_id", athleteId),
      // One query for everyone's preferences rather than one per friend.
      db.from("profiles").select("id, notification_prefs").in("id", friends),
    ]);

    const muted = (mutes ?? []).map((m: { user_id: string }) => m.user_id) as string[];

    // Two different ways to say no, and both have to be honoured: the global
    // switch in settings ("no friend workouts at all") and the per-person bell
    // ("this one specifically").
    const silenced = new Set<string>(muted);
    for (const r of (recipients ?? []) as Array<{ id: string; notification_prefs: unknown }>) {
      if (!wantsNotification(r.notification_prefs, "friendWorkouts")) silenced.add(r.id);
    }

    const who = firstName(profile?.name) || "Um amigo";

    let notified = 0, skipped = 0;

    for (const friendId of friends) {
      if (silenced.has(friendId)) { skipped++; continue; }

      // Claim the slot before sending. The primary key is the throttle: a
      // conflict means somebody already announced this athlete today, so the
      // second import path through here stays quiet.
      const { error } = await db.from("friend_workout_notices").insert({
        user_id: friendId, friend_id: athleteId, date: workout.date,
      });
      if (error) { skipped++; continue; }

      await send(friendId, {
        title: `${who} treinou`,
        body:  describeWorkout(workout),
        url:   "/friends",
        tag:   `limiar-friend-${athleteId}-${workout.date}`,
      });
      notified++;
    }

    return { notified, skipped };
  } catch {
    // The workout is saved; the applause is optional.
    return { notified: 0, skipped: 0 };
  }
}

/** "Sérgio Carmelo" → "Sérgio". A lock screen has no room for surnames. */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Someone wants to be your friend. */
export async function notifyFriendRequest(
  db: Db,
  requesterId: string,
  addresseeId: string,
  send: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<unknown>,
): Promise<boolean> {
  try {
    const [{ data: profile }, { data: recipient }] = await Promise.all([
      db.from("profiles").select("name, username").eq("id", requesterId).single(),
      db.from("profiles").select("notification_prefs").eq("id", addresseeId).single(),
    ]);
    if (!wantsNotification(recipient?.notification_prefs, "friendRequests")) return false;

    const who = firstName(profile?.name) || (profile?.username ? `@${profile.username}` : "Alguém");

    await send(addresseeId, {
      title: "Novo pedido de amizade",
      body:  `${who} quer treinar junto com você.`,
      url:   "/friends",
      // Per requester, so two different people do not overwrite each other on
      // the lock screen — and a second request from the same person does.
      tag:   `limiar-friend-request-${requesterId}`,
    });
    return true;
  } catch {
    return false;
  }
}

/** Your request was accepted. */
export async function notifyFriendAccepted(
  db: Db,
  accepterId: string,
  requesterId: string,
  send: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<unknown>,
): Promise<boolean> {
  try {
    const [{ data: profile }, { data: recipient }] = await Promise.all([
      db.from("profiles").select("name, username").eq("id", accepterId).single(),
      db.from("profiles").select("notification_prefs").eq("id", requesterId).single(),
    ]);
    if (!wantsNotification(recipient?.notification_prefs, "friendRequests")) return false;

    const who = firstName(profile?.name) || (profile?.username ? `@${profile.username}` : "Seu pedido");

    await send(requesterId, {
      title: "Pedido aceito",
      body:  `${who} aceitou seu pedido de amizade.`,
      url:   "/friends",
      tag:   `limiar-friend-accepted-${accepterId}`,
    });
    return true;
  } catch {
    return false;
  }
}
