/**
 * A conversa gravada com a IA.
 *
 *   POST   { suggestionId }  → grava a pergunta sugerida e a leitura que a respondeu
 *   DELETE                   → apaga a conversa inteira
 *
 * As sugestões são respondidas de forma determinística, a partir do mesmo
 * dossiê da tela — sem chamar o modelo, sem custo e sem espera. A resposta é
 * recalculada aqui, no servidor, em vez de aceitar o texto que o cliente
 * mostrou: o que fica gravado tem que ser o que o motor conclui, não o que
 * alguém mandou pela rede.
 *
 * Apagar é do atleta. Guardar sem poder apagar não é guardar, é reter.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadAthleteBrief } from "@/lib/ai-brief-load";
import { answerSuggestion, suggestionById } from "@/lib/ai-brief";
import { athleteDateStr } from "@/lib/week";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { suggestionId?: unknown };
  try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const suggestion = typeof body.suggestionId === "string" ? suggestionById(body.suggestionId) : null;
  if (!suggestion) return json({ error: "Sugestão desconhecida" }, 400);

  const admin = createAdminClient();
  const brief = await loadAthleteBrief(supabase, admin, user.id).catch(() => null);
  const answered = brief ? answerSuggestion(brief, suggestion) : null;
  if (!answered) return json({ error: "Ainda não tenho dados para responder isso." }, 404);

  const date = athleteDateStr();
  await admin.from("ai_messages").insert([
    { user_id: user.id, role: "user", kind: "sugestao", topic: suggestion.id, content: suggestion.question, date },
    {
      user_id: user.id, role: "assistant", kind: "sugestao", topic: suggestion.id,
      content: answered.content, sources: answered.sources, date,
    },
  ]);

  return json({ answer: answered.content, sources: answered.sources });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = createAdminClient();
  const { error } = await admin.from("ai_messages").delete().eq("user_id", user.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}
