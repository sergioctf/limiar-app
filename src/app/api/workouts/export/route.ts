/**
 * POST /api/workouts/export
 * Body: { label: string, structure: StructuredWorkout }
 * Returns a binary .FIT workout file (Garmin/Coros/Wahoo/Zepp compatible).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildWorkoutFit } from "@/lib/workout-fit";
import type { StructuredWorkout } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const label = (body?.label as string | undefined)?.trim() || "Treino Limiar";
  const structure = body?.structure as StructuredWorkout | undefined;

  if (!structure || !Array.isArray(structure.blocks) || structure.blocks.length === 0) {
    return NextResponse.json({ error: "Treino sem estrutura para exportar" }, { status: 400 });
  }

  try {
    const bytes = buildWorkoutFit(label, structure);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.fit"`,
      },
    });
  } catch (err) {
    console.error("[workouts/export] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao gerar arquivo" },
      { status: 500 },
    );
  }
}
