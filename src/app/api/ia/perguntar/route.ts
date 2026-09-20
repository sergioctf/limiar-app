/**
 * POST /api/ia/perguntar — a pergunta aberta do atleta.
 *
 * O dossiê é montado aqui, no servidor, e não vem do cliente: quem pergunta não
 * pode escolher os números sobre os quais a IA vai responder.
 *
 * Sem limite de uso (decisão do Sérgio, 20/09). A conversa fica gravada, com a
 * data do atleta, para dar continuidade e para poder ser auditada depois — é a
 * IA falando de treino e de saúde de alguém.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadAthleteBrief } from "@/lib/ai-brief-load";
import { briefText } from "@/lib/ai-brief";
import { answerAthleteQuestion } from "@/lib/ai";
import { athleteDateStr } from "@/lib/week";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

const MAX_QUESTION = 1000;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { question?: unknown };
  try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return json({ error: "Pergunta vazia" }, 400);
  if (question.length > MAX_QUESTION) return json({ error: "Pergunta longa demais" }, 400);

  const admin = createAdminClient();
  const date = athleteDateStr();

  // As últimas trocas, para "e na semana passada?" continuar fazendo sentido.
  const { data: recent } = await admin
    .from("ai_messages").select("role, content")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(6);
  const history = ((recent ?? []) as Array<{ role: "user" | "assistant"; content: string }>).reverse();

  const brief = await loadAthleteBrief(supabase, admin, user.id).catch(() => null);
  if (!brief) return json({ error: "Não consegui reunir seus dados agora." }, 503);

  const answer = await answerAthleteQuestion({
    brief: briefText(brief),
    question,
    firstName: brief.firstName,
    history,
  });

  if (!answer) {
    // A pergunta do atleta não se perde só porque o modelo não respondeu.
    await admin.from("ai_messages").insert({
      user_id: user.id, role: "user", kind: "aberta", content: question, date,
    });
    return json({ error: "A IA não respondeu agora. Tente de novo em instantes." }, 503);
  }

  const sources = brief.sections.map(s => s.title);
  await admin.from("ai_messages").insert([
    { user_id: user.id, role: "user",      kind: "aberta", content: question, date },
    { user_id: user.id, role: "assistant", kind: "aberta", content: answer, sources, date },
  ]);

  return json({ answer, sources });
}
