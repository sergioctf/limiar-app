import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadNavData } from "@/lib/nav-data";
import { NAV_ALL_VISIBLE } from "@/lib/nav-visibility";
import { Sidebar } from "./Sidebar";
import { IdentityGate } from "@/components/profile/IdentityGate";
import { MobileBottomNav } from "./MobileBottomNav";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { AreaTabs, MobileTopBar } from "./AreaChrome";
import { CoachFab } from "@/components/ai/CoachFab";

interface AppShellProps {
  children: React.ReactNode;
}

/*
  O menu é montado aqui, com as contagens do atleta.

  Quem não tem corrida não vê Histórico, quem não tem relógio não vê Saúde — e
  as Configurações explicam o que falta para cada porta abrir (a regra está em
  `nav-visibility.ts`). Na falha de leitura, tudo aparece: esconder por engano
  é pior do que mostrar demais.
*/
export async function AppShell({ children }: AppShellProps) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const nav = user
    ? await loadNavData(createAdminClient(), user.id).catch(() => NAV_ALL_VISIBLE)
    : NAV_ALL_VISIBLE;

  return (
    <div className="flex min-h-screen">
      <Sidebar nav={nav} />
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <MobileTopBar />
        <OfflineBanner />
        {/*
          The readiness pop-up used to live here, firing on whatever page the
          athlete happened to open. It now arrives as a card in the advisor's
          list — one inbox for every proposal, instead of one that ambushes and
          one you have to go and find.
        */}
        {/* Content area — padded on mobile for bottom nav + safe area */}
        <div className="flex-1 p-4 md:p-6 lg:pb-6" style={{ paddingBottom: "calc(7.5rem + env(safe-area-inset-bottom))" }}>
          <ErrorBoundary>
            <AreaTabs nav={nav} />
            {children}
            {/* Blocks only when name, surname or handle is missing. */}
            <IdentityGate />
          </ErrorBoundary>
        </div>
      </main>
      {/* A IA é uma camada sobre o app, não uma aba: alcançável de qualquer tela. */}
      <CoachFab />
      <MobileBottomNav nav={nav} />
    </div>
  );
}
