/**
 * GET /api/icons/[size]
 * Redirects to the real Limiar PNG icon in /public.
 * Kept for backwards compatibility with any cached manifests.
 */
export const runtime = "edge";

export async function GET(request: Request): Promise<Response> {
  return Response.redirect(
    new URL("/limiar_icone_app.png", request.url),
    301
  );
}
