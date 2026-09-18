/**
 * POST /api/coach/adapt — "Adaptar este treino".
 *
 *   { action: "options",  day, reason }            → two or three alternatives
 *   { action: "evaluate", day, text }              → the coach reads the athlete's own proposal
 *   { action: "accept",   day, reason, source: "option", optionId }
 *   { action: "accept",   day, reason, source: "custom", text, useAdjusted }
 *   { action: "undo",     day }
 *
 * Only this week's running sessions, today or later. The server rebuilds every
 * accepted session from the same inputs instead of trusting a session sent by
 * the browser: what lands in the plan is what the engine would have produced.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ADAPT_REASONS, adaptOptions, applyAdaptation, evaluateProposal, isAdaptable, undoAdaptation,
  type AdaptContext, type AdaptReason,
} from "@/lib/session-adapt";
import { loadAdaptContext } from "@/lib/adapt-context";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

export const dynamic = "force-dynamic";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

const DAYS: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function POST(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente." }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  const dayKey = body?.day as WeeklyPlanDay["day"];
  if (!body || typeof action !== "string" || !DAYS.includes(dayKey)) return json({ error: "Pedido inválido." }, 400);

  const loaded = await loadAdaptContext(user.id).catch(() => null);
  if (!loaded) return json({ error: "Não há plano para esta semana." }, 404);
  const { admin, reportId, plan, ctx, todayKey } = loaded;

  // A past day is history, not a session to adapt.
  if (DAYS.indexOf(dayKey) < DAYS.indexOf(todayKey)) return json({ error: "Só é possível adaptar o treino de hoje ou dos próximos dias." }, 409);
  const current = plan.days.find(d => d.day === dayKey) ?? null;
  const planned = current?.adaptation?.original ?? current;
  if (!current || !planned || !isAdaptable(planned)) return json({ error: "Só corridas do plano podem ser adaptadas." }, 409);

  const save = async (next: WeeklyPlanData) => {
    const { error } = await admin.from("coach_reports")
      .update({ full_report: JSON.stringify(next) }).eq("id", reportId).eq("user_id", user.id);
    return !error;
  };

  if (action === "options") {
    const reason = body.reason as AdaptReason;
    if (!(reason in ADAPT_REASONS)) return json({ error: "Motivo inválido." }, 400);
    const result = adaptOptions(planned, reason, ctx);
    return json({ planned, current, ...result });
  }

  if (action === "evaluate") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 200) return json({ error: "Descreva o treino em até 200 caracteres." }, 400);
    return json({ planned, evaluation: evaluateProposal(text, planned, ctx) });
  }

  if (action === "undo") {
    const result = undoAdaptation(plan, dayKey);
    if ("error" in result) return json({ error: result.error }, 409);
    if (!(await save(result.plan))) return json({ error: "Não foi possível desfazer agora." }, 503);
    return json({ ok: true, day: result.plan.days.find(d => d.day === dayKey) });
  }

  if (action === "accept") {
    const reason = (body.reason as AdaptReason) in ADAPT_REASONS ? body.reason as AdaptReason : null;
    let adapted: WeeklyPlanDay | null = null;
    let meta: { preserves: string; changes: string; verdict?: "equivalent" | "partial" | "different"; text?: string | null; source: "option" | "custom" };

    if (body.source === "option") {
      if (!reason) return json({ error: "Motivo inválido." }, 400);
      const option = adaptOptions(planned, reason, ctx).options.find(o => o.id === body.optionId);
      if (!option) return json({ error: "Essa alternativa não está mais disponível. Veja as opções de novo." }, 409);
      adapted = option.day;
      meta = { preserves: option.preserves, changes: option.changes, source: "option" };
    } else if (body.source === "custom") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const evaluation = evaluateProposal(text, planned, ctx);
      if (!evaluation.understood || !evaluation.day) return json({ error: "Preciso entender o treino antes de usá-lo.", evaluation }, 400);
      adapted = body.useAdjusted === true && evaluation.adjusted ? evaluation.adjusted.day : evaluation.day;
      meta = {
        preserves: evaluation.preserves ?? "", changes: evaluation.changes ?? "",
        verdict: evaluation.verdict, text, source: "custom",
      };
    } else {
      return json({ error: "Pedido inválido." }, 400);
    }

    const result = applyAdaptation(plan, dayKey, adapted, { when: "before", reason, ...meta });
    if ("error" in result) return json({ error: result.error }, 409);
    if (!(await save(result.plan))) return json({ error: "Não foi possível salvar a adaptação agora." }, 503);
    return json({ ok: true, day: result.plan.days.find(d => d.day === dayKey) });
  }

  return json({ error: "Pedido inválido." }, 400);
}
