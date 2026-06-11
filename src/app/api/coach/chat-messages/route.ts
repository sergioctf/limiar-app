/**
 * GET /api/coach/chat-messages?reportId=xxx
 * Retorna histórico de chat de um plano semanal específico.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ messages: [] });

  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("coach_chat_messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
