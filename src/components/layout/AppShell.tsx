import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Content area — padded on mobile for bottom nav */}
        <div className="flex-1 p-4 md:p-6 pb-24 lg:pb-6">
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
