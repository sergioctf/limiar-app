/**
 * POST /api/workouts/push
 *
 * Põe o treino no calendário do intervals.icu, que o entrega ao relógio.
 *
 * O caminho e o porquê estão em `src/lib/icu-workout.ts`. Em resumo: o `.FIT`
 * baixado não tem como ser importado no Garmin Connect do celular, e a API da
 * Garmin está fechada para apps novos — mas o intervals.icu é parceiro antigo,
 * já empurra treino planejado para o relógio, e o atleta já está conectado lá
 * pela saúde.
 *
 * Reenviar o mesmo dia substitui o que estava lá, pelo `external_id`. Sem isso,
 * quem tocasse duas vezes — ou tocasse de novo depois de adaptar o treino —
 * acabaria com dois treinos no mesmo dia no relógio.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { icuAuthHeader, ICU_API_BASE } from "@/lib/intervals";
import { icuEventPayload } from "@/lib/icu-workout";
import { ALL_SPORTS, type PrimarySport } from "@/lib/sports";
import type { StructuredWorkout } from "@/types";

export const dynamic = "force-dynamic";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Entre novamente para enviar o treino." }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const date      = typeof body?.date === "string" && DATA.test(body.date) ? body.date : null;
  const weekStart = typeof body?.weekStart === "string" && DATA.test(body.weekStart) ? body.weekStart : null;
  const day       = typeof body?.day === "string" && /^[A-Za-z]{3}$/.test(body.day) ? body.day : null;
  const label     = (typeof body?.label === "string" ? body.label : "").trim() || "Treino Limiar";
  const structure = body?.structure as StructuredWorkout | undefined;
  const sport: PrimarySport = ALL_SPORTS.includes(body?.sport as PrimarySport)
    ? (body!.sport as PrimarySport) : "corrida";

  if (!date || !weekStart || !day) return json({ error: "Treino sem data para enviar." }, 400);
  if (!structure?.blocks?.length) return json({ error: "Este treino não tem estrutura para enviar." }, 400);

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("intervals_connections")
    .select("athlete_id, api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conn?.api_key) {
    return json({
      error: "Conecte o intervals.icu em Configurações para enviar treinos ao relógio.",
      needsConnection: true,
    }, 409);
  }

  const evento = icuEventPayload({
    date, label, structure, sport, weekStart, day,
    distanceKm: typeof body?.distanceKm === "number" ? body.distanceKm : undefined,
    durationMin: typeof body?.durationMin === "number" ? body.durationMin : undefined,
  });
  if (!evento) return json({ error: "Este treino não tem passos que o relógio entenda." }, 400);

  const auth = icuAuthHeader(conn.api_key as string);
  const base = `${ICU_API_BASE}/athlete/${conn.athlete_id}`;

  try {
    /*
      Primeiro apaga o que o Limiar já tinha posto neste dia.

      O intervals.icu não tem "upsert por external_id", então a limpeza é
      nossa: listar o dia, achar o que leva o nosso id, apagar. Em melhor
      esforço — falhar aqui significa, no pior caso, um treino repetido, e isso
      não é motivo para não entregar o novo.
    */
    const existentes = await fetch(`${base}/events?oldest=${date}&newest=${date}`, {
      headers: { Authorization: auth },
    });
    if (existentes.ok) {
      const lista = await existentes.json() as Array<{ id: number; external_id?: string }>;
      for (const e of lista) {
        if (e.external_id === evento.external_id) {
          await fetch(`${base}/events/${e.id}`, { method: "DELETE", headers: { Authorization: auth } })
            .catch(() => undefined);
        }
      }
    }

    const res = await fetch(`${base}/events`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(evento),
    });

    if (!res.ok) {
      const detalhe = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[workouts/push] intervals.icu", res.status, detalhe);
      if (res.status === 401 || res.status === 403) {
        return json({
          error: "O intervals.icu recusou a chave. Gere uma nova em Settings → Developer Settings e conecte de novo.",
          needsConnection: true,
        }, 409);
      }
      return json({ error: "O intervals.icu não aceitou o treino agora. Tente de novo em instantes." }, 502);
    }

    const criado = await res.json().catch(() => null) as { id?: number } | null;
    return json({ ok: true, eventId: criado?.id ?? null, date });
  } catch (err) {
    console.error("[workouts/push] erro:", err);
    return json({ error: "Não consegui falar com o intervals.icu agora." }, 502);
  }
}
