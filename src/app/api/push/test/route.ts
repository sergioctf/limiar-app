/**
 * POST /api/push/test → send a test notification to the current user.
 *
 * Lets the athlete verify the whole chain (subscription → VAPID → device)
 * on demand, instead of waiting for the 05:30 cron to find out it's broken.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: subs } = await admin
    .from("push_subscriptions").select("id").eq("user_id", user.id);

  if (!subs || subs.length === 0) {
    return NextResponse.json(
      { error: "Nenhum dispositivo inscrito. Ative as notificações primeiro." },
      { status: 400 },
    );
  }

  const { sent, removed, errors } = await sendPushToUser(admin, user.id, {
    title: "Teste do Limiar ✅",
    body:  "Se você está lendo isso, suas notificações estão funcionando.",
    url:   "/",
    tag:   `limiar-test-${Date.now()}`,   // unique tag so repeats aren't collapsed
    icon:  "/limiar_icone_app.png",
  });

  if (sent === 0) {
    // Surface the real reason instead of blaming an "expired" subscription.
    const detail = errors.length > 0
      ? errors[0]
      : removed > 0
        ? "o serviço de push respondeu que a inscrição não existe mais (410/404)"
        : "motivo desconhecido";

    return NextResponse.json(
      { error: `Nenhuma notificação entregue — ${detail}`, errors, removed },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sent, removed, devices: subs.length, errors });
}
