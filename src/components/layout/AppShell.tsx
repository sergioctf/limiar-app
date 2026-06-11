import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineBanner } from "@/components/shared/OfflineBanner";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <OfflineBanner />
        {/* Content area — padded on mobile for bottom nav + safe area */}
        <div className="flex-1 p-4 md:p-6 lg:pb-6" style={{ paddingBottom: "calc(7.5rem + env(safe-area-inset-bottom))" }}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
