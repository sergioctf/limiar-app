/**
 * Send each athlete's morning notification once, as soon as it has something to say.
 *
 * Called by several schedules that overlap on purpose:
 *
 *   · 05:30 — the Vercel cron (`notify-morning`). Athletes without a watch get
 *     theirs; athletes whose night has already arrived get theirs.
 *   · every 15 minutes, 05:00–09:00 — optional, from Supabase pg_cron
 *     (`/api/cron/morning`). Catches each night the moment Garmin delivers it.
 *   · 08:00 — the Vercel wellness cron, as the final pass: whoever is still
 *     waiting gets a message saying the night has not arrived.
 *
 * `notification_log` makes the overlap safe — the first pass to claim a user's
 * row for the day sends, every later pass sees it and moves on. Without the
 * table (migration 027 not yet applied) only the single 05:30 pass sends, which
 * is exactly how the app behaved before.
 */
import { sendPushToUser } from "@/lib/push";
import { wantsNotification } from "@/lib/notification-prefs";
import { brtDateStr } from "@/lib/plan-notify";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import { morningNotification } from "@/lib/morning-message";
import { syncIntervals } from "@/lib/intervals-sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const KIND = "morning";

export async function dispatchMorning(
  admin: Admin,
  opts: {
    now?: Date;
    /** Last pass of the morning: send to everyone still waiting, night or not. */
    final: boolean;
    /** The single legacy 05:30 pass, used when the log table is missing. */
    legacyPass?: boolean;
  },
): Promise<Record<string, string>> {
  const now = opts.now ?? new Date();
  const today = brtDateStr(now);
  const results: Record<string, string> = {};

  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds: string[] = Array.from(new Set(((subs ?? []) as Array<{ user_id: string }>).map(s => s.user_id)));
  if (userIds.length === 0) return { all: "sem inscritos" };

  const probe = await admin.from("notification_log").select("user_id").limit(1);
  const logReady = !probe.error;
  // The old single-shot behaviour applies only while the log is missing; with it,
  // the 05:30 pass waits for the night like every other pass.
  const legacy = !logReady && Boolean(opts.legacyPass);
  if (!logReady && !opts.legacyPass) {
    // Without a log, a second pass would send everyone a second message.
    return { all: "notification_log ausente (migration 027) — só a passada das 05:30 envia" };
  }

  const [{ data: prefRows }, { data: conns }, logRes] = await Promise.all([
    admin.from("profiles").select("id, notification_prefs").in("id", userIds),
    admin.from("intervals_connections").select("user_id").in("user_id", userIds)
      .then((r: { data: unknown }) => r, () => ({ data: [] })),
    logReady
      ? admin.from("notification_log").select("user_id").eq("kind", KIND).eq("date", today)
      : Promise.resolve({ data: [] }),
  ]);

  const optedOut = new Set(((prefRows ?? []) as Array<{ id: string; notification_prefs: unknown }>)
    .filter(r => !wantsNotification(r.notification_prefs, "dailyWorkout")).map(r => r.id));
  const connected = new Set(((conns ?? []) as Array<{ user_id: string }>).map(c => c.user_id));
  const alreadySent = new Set(((logRes.data ?? []) as Array<{ user_id: string }>).map(r => r.user_id));

  for (const userId of userIds) {
    const id = userId.slice(0, 8);
    if (optedOut.has(userId)) { results[id] = "opted-out"; continue; }
    if (alreadySent.has(userId)) { results[id] = "já enviada hoje"; continue; }

    try {
      const isConnected = connected.has(userId);
      // Read the night straight from intervals.icu, rather than trusting that
      // some earlier sync happened to run after the band did.
      if (isConnected) await syncIntervals(admin, userId).catch(() => null);

      const inputs = await loadRecoveryInputs(admin, userId, now);
      const todayRow = inputs.rows.find(r => r.date === today);
      const nightArrived = Boolean(todayRow && (todayRow.hrv_ms != null || todayRow.sleep_seconds != null));

      if (isConnected && !nightArrived && !opts.final && !legacy) {
        results[id] = "aguardando a noite";
        continue;
      }

      const message = morningNotification(inputs.recovery, { connected: isConnected, nightArrived });
      if (!message) { results[id] = "sem plano hoje"; continue; }

      // Claim the day before sending. Two passes racing for the same athlete:
      // exactly one insert succeeds, and only that one sends.
      if (logReady) {
        const { error } = await admin.from("notification_log").insert({
          user_id: userId, kind: KIND, date: today,
          detail: `${inputs.recovery.basis}${nightArrived ? "+noite" : ""}`,
        });
        if (error) { results[id] = "outra passada enviou"; continue; }
      }

      const { sent, removed } = await sendPushToUser(admin, userId, { ...message, icon: "/api/icons/192" });
      results[id] = `enviada (${inputs.recovery.basis}${nightArrived ? ", noite ok" : ""}) sent:${sent} removed:${removed}`;
    } catch (err) {
      results[id] = `erro: ${err instanceof Error ? err.message : "desconhecido"}`;
    }
  }

  return results;
}
