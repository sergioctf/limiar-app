/**
 * Which notifications an athlete has agreed to receive.
 *
 * Granting push permission in the browser is one decision — "this app may talk
 * to me" — and it used to be the only one available. Someone who wanted the
 * 05:30 workout but not a friend's every run had exactly two options: take both
 * or revoke the permission and lose both. This splits that into the four things
 * the app actually sends.
 *
 * Everything defaults to on. A stored preference is only ever a subtraction, so
 * a profile written before this existed keeps behaving as it always did.
 */

export type NotificationKind =
  | "dailyWorkout"     // 05:30 — today's session
  | "tomorrowWorkout"  // 22:00 — tomorrow's, so you can prepare
  | "friendWorkouts"   // a friend trained
  | "friendRequests";  // someone added you, or accepted

export type NotificationPrefs = Record<NotificationKind, boolean>;

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "dailyWorkout", "tomorrowWorkout", "friendWorkouts", "friendRequests",
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyWorkout:    true,
  tomorrowWorkout: true,
  friendWorkouts:  true,
  friendRequests:  true,
};

export const NOTIFICATION_LABELS: Record<NotificationKind, { label: string; detail: string }> = {
  dailyWorkout: {
    label:  "Treino e recuperação do dia",
    detail: "De manhã: com relógio, assim que a noite chega (até 08:00); sem relógio, às 05:30 com o check-in.",
  },
  tomorrowWorkout: {
    label:  "Prévia de amanhã",
    detail: "Às 22:00, o treino do dia seguinte — dá tempo de preparar a roupa e o tênis.",
  },
  friendWorkouts: {
    label:  "Treinos de amigos",
    detail: "Quando um amigo registra um treino. No máximo um aviso por amigo por dia; " +
            "dá para silenciar pessoas específicas no perfil de cada uma.",
  },
  friendRequests: {
    label:  "Pedidos de amizade",
    detail: "Quando alguém te adiciona ou aceita seu pedido.",
  },
};

/**
 * Read a stored value into a complete set of preferences.
 *
 * Unknown keys are dropped and missing ones default to on, so a preference
 * written by an older or newer version of the app never turns into `undefined`
 * at the point where it decides whether to send.
 */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

  for (const kind of NOTIFICATION_KINDS) {
    const value = (raw as Record<string, unknown>)[kind];
    // Only an explicit `false` turns anything off.
    if (value === false) out[kind] = false;
  }
  return out;
}

/** Does this athlete want this kind of notification? */
export function wantsNotification(raw: unknown, kind: NotificationKind): boolean {
  return normalizeNotificationPrefs(raw)[kind];
}
