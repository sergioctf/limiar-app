export const STRAVA_OAUTH_COOKIE = "limiar_strava_oauth";

export function readStravaAttempt(value: string | undefined, userId: string) {
  if (!value) return null;
  try {
    const attempt = JSON.parse(value);
    if (attempt?.userId !== userId || typeof attempt.state !== "string" || !attempt.state) return null;
    return { state: attempt.state as string, from: attempt.from === "onboarding" ? "/" : "/settings" };
  } catch {
    return null;
  }
}
