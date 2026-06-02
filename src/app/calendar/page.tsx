import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ActivityCalendar } from "@/components/calendar/ActivityCalendar";

export const metadata = { title: "Calendário — Limiar" };

export default async function CalendarPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-surface-400 hover:text-surface-200 text-sm mb-3 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-surface-100">Calendário</h1>
        <p className="text-surface-500 text-sm mt-1">
          Todas as atividades — corridas, academia, ciclismo, natação…
        </p>
      </div>
      <ActivityCalendar />
    </div>
  );
}
