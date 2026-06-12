import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ActivityCalendar } from "@/components/calendar/ActivityCalendar";

export const metadata = { title: "Calendário — Limiar" };

export default async function CalendarPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  return (
    <AppShell>
      <div className="space-y-5 max-w-4xl mx-auto animate-fade-in">
        <div>
          <h1 className="page-header">Calendário</h1>
          <p className="text-surface-500 text-sm mt-0.5">
            Todas as atividades — corridas, academia, ciclismo, natação…
          </p>
        </div>
        <ActivityCalendar />
      </div>
    </AppShell>
  );
}
