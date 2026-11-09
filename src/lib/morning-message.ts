/**
 * The morning notification, written from today's recovery.
 *
 * It used to go out at 05:30 whatever the data said — which, for anyone with a
 * watch, meant before the night had arrived. The athlete got a readiness line
 * built on training load alone, then opened the app two hours later to a
 * different number. The notification now waits for the night, and says which
 * of three situations it is in rather than pretending they are the same:
 *
 *   · the night arrived → the score and what it means for the session;
 *   · a watch is connected but the night has not come → say so, and how to fix it;
 *   · no watch → ask the two questions that stand in for one.
 */
import { formatWorkoutNotification } from "@/lib/plan-notify";
import type { RecoveryToday } from "@/lib/recovery-today";

export interface MorningNotification {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const BODY_MAX = 150;

function clip(text: string): string {
  return text.length <= BODY_MAX ? text : `${text.slice(0, BODY_MAX - 1).trimEnd()}…`;
}

export function morningNotification(
  recovery: RecoveryToday,
  ctx: { connected: boolean; nightArrived: boolean },
): MorningNotification | null {
  const session = recovery.session;
  if (!session) return null;   // no plan for today: nothing to say at 06:00

  const workout = formatWorkoutNotification(session, "Hoje");
  const tag = `limiar-morning-${recovery.date}`;

  if (recovery.sessionUnresolved) {
    return { title: recovery.advice.headline, body: recovery.advice.detail, url: "/coach", tag };
  }

  if (ctx.connected && ctx.nightArrived && recovery.score != null) {
    const act = recovery.offer && !recovery.offer.undo
      ? " Abra para trocar o treino com um toque."
      : "";
    return {
      title: `Recuperação ${recovery.score} · ${workout.title}`,
      body: clip(`${recovery.advice.detail}${act}`),
      // The dashboard holds today's session and the swap buttons together.
      url: "/",
      tag,
    };
  }

  if (ctx.connected) {
    return {
      title: workout.title,
      body: clip("A noite ainda não chegou do Garmin. Sincronize a pulseira no app Garmin Connect e abra o Limiar para ver sua recuperação."),
      url: "/health",
      tag,
    };
  }

  if (recovery.needsCheckin) {
    return {
      title: workout.title,
      body: clip("Como você dormiu? Um check-in de 20 segundos ajusta a recuperação e diz se hoje é dia de apertar."),
      url: "/health?checkin=1",
      tag,
    };
  }

  return {
    title: recovery.score != null ? `Recuperação ${recovery.score} · ${workout.title}` : workout.title,
    body: clip(recovery.advice.detail),
    url: "/",
    tag,
  };
}
