import { NextResponse, type NextRequest } from "next/server";
import { isDevPreview } from "@/lib/dev-preview";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/dev" || pathname.startsWith("/dev/")) {
    return isDevPreview() ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  if (isDevPreview() && /^\/(?:auth\/callback|api\/(?:admin|cron|ingest|integrations|push|strava|whoop)(?:\/|$)|api\/ia\/transcrever$)/.test(pathname)) {
    return NextResponse.json({ error: "Integração externa indisponível na prévia local." }, { status: 403 });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
