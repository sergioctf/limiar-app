/**
 * /ia — a IA central.
 *
 * O dossiê é montado aqui, no servidor, e viaja inteiro para a tela: é o que
 * permite as leituras responderem na hora, sem rede. A pergunta aberta volta ao
 * servidor, que monta o dossiê de novo por conta própria — o que o cliente tem
 * serve para mostrar, nunca para decidir o que a IA sabe.
 */
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AiContent, type AiMessage } from "@/components/ai/AiContent";
import { loadAthleteBrief } from "@/lib/ai-brief-load";
import { suggestionById, suggestionsFor } from "@/lib/ai-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** A conversa recente. O suficiente para dar continuidade sem virar um arquivo. */
const HISTORY = 40;

/**
 * `?leitura=semana_passada` abre a tela já com aquela leitura respondida.
 *
 * É o que os avisos do app usam para levar direto à resposta, em vez de a uma
 * tela onde o atleta ainda precisa achar a pergunta. Um id desconhecido é
 * ignorado — a tela abre como sempre.
 */
export default async function IaPage({ searchParams }: { searchParams?: { leitura?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const admin = createAdminClient();

  const [brief, history] = await Promise.all([
    loadAthleteBrief(supabase, admin, user.id),
    admin.from("ai_messages").select("id, role, content, date")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(HISTORY)
      .then((r: { data: AiMessage[] | null }) => (r.data ?? []).reverse(), () => [] as AiMessage[]),
  ]);

  const suggestions = suggestionsFor(brief);
  const requested = searchParams?.leitura ? suggestionById(searchParams.leitura) : null;
  // Só abre sozinha uma leitura que este atleta tem dado para responder.
  const autoAsk = requested && suggestions.some(s => s.id === requested.id) ? requested.id : null;

  return (
    <AppShell>
      <AiContent
        brief={brief}
        suggestions={suggestions}
        history={history}
        firstName={brief.firstName}
        autoAsk={autoAsk}
      />
    </AppShell>
  );
}
