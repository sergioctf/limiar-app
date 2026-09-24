/**
 * Treinador → Calibração.
 *
 * O teste de 3 km e tudo que ele calcula, num lugar só. Antes o teste morava
 * numa aba e os ritmos, zonas e previsões que ele produz moravam no meio da
 * aba do plano, atrás de dois níveis de "abrir".
 */
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { CalibrationContent } from "@/components/coach/CalibrationContent";
import type { PerformanceTest } from "@/types";

export const metadata = { title: "Calibração — Limiar" };

export default async function CalibracaoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // A tabela pode não existir num projeto antigo: sem teste, a tela ensina a fazer um.
  const tests = await createAdminClient()
    .from("performance_tests").select("*")
    .eq("user_id", user.id).order("test_date", { ascending: false })
    .then((r: { data: PerformanceTest[] | null }) => r.data ?? [], () => [] as PerformanceTest[]);

  return (
    <AppShell>
      <CalibrationContent tests={tests} />
    </AppShell>
  );
}
