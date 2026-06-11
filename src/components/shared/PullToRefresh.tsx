"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number; // Default: 80px
}

export function PullToRefresh({ children, onRefresh, threshold = 80 }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only enable on mobile/touch devices
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(() => window.matchMedia("(hover: none)").matches);
  }, []);

  const handleTouchStart = (e: TouchEvent) => {
    // Only start if scrolled to top
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop === 0 && !isRefreshing) {
      startYRef.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const distance = currentY - startYRef.current;

    if (distance > 0) {
      e.preventDefault();
      setPullDistance(Math.min(distance, threshold + 40));
    } else {
      setIsPulling(false);
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    setIsPulling(false);

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  useEffect(() => {
    if (!isTouchDevice) return;

    window.addEventListener("touchstart", handleTouchStart as EventListener);
    window.addEventListener("touchmove", handleTouchMove as EventListener, { passive: false });
    window.addEventListener("touchend", handleTouchEnd as EventListener);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart as EventListener);
      window.removeEventListener("touchmove", handleTouchMove as EventListener);
      window.removeEventListener("touchend", handleTouchEnd as EventListener);
    };
  }, [isPulling, isRefreshing, pullDistance, isTouchDevice]);

  const pullPercent = Math.min(100, (pullDistance / threshold) * 100);
  const isReady = pullDistance >= threshold;

  return (
    <div ref={containerRef} className="relative">
      {/* Pull-to-refresh indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center bg-gradient-to-b from-surface-800 to-surface-900 transition-all"
          style={{
            height: `${Math.min(pullDistance, threshold + 20)}px`,
            opacity: Math.min(1, pullDistance / (threshold / 2)),
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <RotateCcw
              className={`w-5 h-5 text-brand-400 transition-transform ${
                isRefreshing ? "animate-spin" : ""
              }`}
              style={
                !isRefreshing
                  ? { transform: `rotate(${pullPercent * 3.6}deg)` }
                  : undefined
              }
            />
            <p className="text-xs text-surface-400">
              {isRefreshing
                ? "Atualizando…"
                : isReady
                ? "Solte para atualizar"
                : "Puxe para atualizar"}
            </p>
          </div>
        </div>
      )}

      {/* Spacer during pull */}
      {isPulling && !isRefreshing && (
        <div
          className="transition-all"
          style={{ height: `${pullDistance}px` }}
        />
      )}

      {/* Content */}
      <div className={isRefreshing ? "opacity-60" : "opacity-100"}>
        {children}
      </div>
    </div>
  );
}
