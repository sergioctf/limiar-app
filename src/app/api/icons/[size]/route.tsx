/**
 * GET /api/icons/[size]
 * Redirects to the real Limiar PNG icon in /public.
 * Kept for backwards compatibility with any cached manifests.
 */
export const runtime = "edge";

export async function GET(): Promise<Response> {
  return Response.redirect(
    new URL("/limiar_icone_app.png", "https://limiar-app.vercel.app"),
    301
  );
}
