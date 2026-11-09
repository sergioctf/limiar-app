"use client";

import { createContext, useContext, useEffect } from "react";
import { clearLegacyDeviceData } from "@/lib/device-data";

const Account = createContext("");

export function DeviceAccount({ userId, children }: { userId: string; children: React.ReactNode }) {
  useEffect(() => { void clearLegacyDeviceData(); }, []);
  return <Account.Provider key={userId} value={userId}>{children}</Account.Provider>;
}

export function useDeviceAccount() {
  return useContext(Account);
}
