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

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
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
            <AreaTabs />
            {children}
            {/* Blocks only when name, surname or handle is missing. */}
            <IdentityGate />
          </ErrorBoundary>
        </div>
      </main>
      {/* A IA é uma camada sobre o app, não uma aba: alcançável de qualquer tela. */}
      <CoachFab />
      <MobileBottomNav />
    </div>
  );
}
