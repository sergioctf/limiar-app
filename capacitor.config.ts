import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Limiar native shell.
 *
 * The app is server-rendered (Next.js with server components, API routes and
 * auth middleware), so the native build CANNOT be a static export. Instead the
 * shell loads the live deployment via `server.url`, and the only thing the
 * native layer adds is reading Garmin-sourced wellness (sleep/HRV/RHR/body
 * battery) from Health Connect (Android) / HealthKit (iOS) and POSTing it to
 * /api/health/wellness.
 *
 * For local development against a dev server, change server.url to your LAN
 * dev URL (e.g. http://192.168.0.x:3000) and set cleartext: true.
 */
const config: CapacitorConfig = {
  appId: "app.limiar.performance",
  appName: "Limiar",
  webDir: "native-shell",
  server: {
    url: "https://limiar-app.vercel.app",
    androidScheme: "https",
  },
};

export default config;
