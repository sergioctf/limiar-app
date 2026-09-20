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
import { suggestionsFor } from "@/lib/ai-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** A conversa recente. O suficiente para dar continuidade sem virar um arquivo. */
const HISTORY = 40;

export default async function IaPage() {
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

  return (
    <AppShell>
      <AiContent
        brief={brief}
        suggestions={suggestionsFor(brief)}
        history={history}
        firstName={brief.firstName}
      />
    </AppShell>
  );
}
