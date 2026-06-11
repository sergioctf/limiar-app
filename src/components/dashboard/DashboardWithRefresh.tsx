"use client";

import { useState } from "react";
import { PullToRefresh } from "@/components/shared/PullToRefresh";

interface DashboardWithRefreshProps {
  children: React.ReactNode;
}

/**
 * Wrapper que permite pull-to-refresh no dashboard.
 * Recarrega a página inteira (server revalidates data).
 */
export function DashboardWithRefresh({ children }: DashboardWithRefreshProps) {
  const [refreshCount, setRefreshCount] = useState(0);

  const handleRefresh = async () => {
    // Revalidate server data by triggering a full page reload
    // In production, this could use ISR/revalidateTag instead
    window.location.reload();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      {children}
    </PullToRefresh>
  );
}
