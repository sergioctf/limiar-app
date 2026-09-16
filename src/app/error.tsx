"use client";

import { ErrorScreen } from "@/components/shared/ErrorScreen";

/**
 * Catches anything a route segment throws — including server components, which
 * the React class boundary inside AppShell cannot reach. A page whose data
 * fetch throws used to render Next's stock error page: an untranslated wall
 * with no way back into the app.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} />;
}
