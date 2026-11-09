import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDevPreview } from "@/lib/dev-preview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDevPreview()) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const scenario = url.searchParams.get("cenario");
  if (scenario !== "atleta" && scenario !== "novo") {
    return new NextResponse("Cenário inválido.", { status: 400 });
  }
  const { error } = await createClient().auth.signInWithPassword({
    email: `${scenario}@limiar.example`,
    password: "limiar-preview",
  });
  if (error) return new NextResponse("O serviço local da prévia está indisponível.", { status: 503 });
  return new NextResponse(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store" } });
}
