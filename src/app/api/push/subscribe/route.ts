/**
 * POST /api/push/subscribe   → save push subscription for current user
 * DELETE /api/push/subscribe → remove all push subscriptions for current user
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { endpoint, keys } = body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription object" }, { status: 400 });
  }

  const admin = createAdminClient();
  const userAgent = request.headers.get("user-agent")?.slice(0, 200) ?? null;

  // Upsert — if same endpoint already exists for this user, update keys
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id:    user.id,
        endpoint,
        p256dh_key: keys.p256dh,
        auth_key:   keys.auth,
        user_agent: userAgent,
      },
      { onConflict: "user_id,endpoint" }
    );

  if (error) {
    console.error("[push/subscribe] upsert error:", error);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }

  // Send welcome notification immediately (fire-and-forget)
  sendPush(
    { endpoint, p256dh_key: keys.p256dh, auth_key: keys.auth },
    {
      title: "Bem-vindo ao Limiar Performance! 🧡",
      body:  "Suas notificações estão ativas. Você receberá o plano de treino toda manhã às 05:30h.",
      url:   "/",
      tag:   "limiar-welcome",
      icon:  "/limiar_icone_app.png",
    },
  ).catch(() => {}); // fire-and-forget, never blocks the response

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Allow deleting a specific endpoint or all subscriptions
  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint as string | undefined;

  const admin = createAdminClient();
  let query = admin.from("push_subscriptions").delete().eq("user_id", user.id);
  if (endpoint) query = (query as unknown as typeof query).eq("endpoint", endpoint);

  await query;
  return NextResponse.json({ ok: true });
}
