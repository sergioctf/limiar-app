"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Slim banner shown while the device has no network connection.
 * Listens to the browser online/offline events.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline  = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online",  goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online",  goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="sticky top-0 z-[60] bg-yellow-500/15 border-b border-yellow-500/30 backdrop-blur-sm animate-slide-in-down">
      <div className="flex items-center justify-center gap-2 py-1.5 px-4">
        <WifiOff className="w-3.5 h-3.5 text-yellow-400" />
        <p className="text-xs font-medium text-yellow-300">
          Sem conexão — mostrando dados salvos
        </p>
      </div>
    </div>
  );
}
