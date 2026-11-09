/** Enabled only by the local fixture launcher, never a production build. */
export function isDevPreview(): boolean {
  return process.env.NODE_ENV === "development"
    && process.env.LIMIAR_PREVIEW === "1"
    && /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}
