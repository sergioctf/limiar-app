/**
 * GET /api/nav-visibility → o que está escondido do menu, e por quê.
 *
 * O menu é montado no servidor (`AppShell`), mas as Configurações precisam
 * contar a mesma história para quem foi procurar a porta que sumiu — e a regra
 * tem que ser a mesma, lida do mesmo lugar (`nav-visibility.ts`).
 */
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadNavData } from "@/lib/nav-data";
import { hiddenAreas } from "@/lib/nav-visibility";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const nav = await loadNavData(createAdminClient(), user.id);
    return NextResponse.json({ hidden: hiddenAreas(nav) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    // Na dúvida, nada escondido: o card simplesmente não aparece.
    return NextResponse.json({ hidden: [] });
  }
}
