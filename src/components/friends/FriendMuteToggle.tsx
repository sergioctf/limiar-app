"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

/**
 * Whether this friend's workouts reach your lock screen.
 *
 * On by default — you added them because you wanted to see what they do. The
 * toggle exists for the friend who trains twice a day, and it is private: they
 * are never told, and the friendship is untouched.
 */
export function FriendMuteToggle({
  friendId, friendName, className = "",
}: {
  friendId: string;
  friendName?: string | null;
  className?: string;
}) {
  const [muted, setMuted]   = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/friends/mute")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        setMuted(Array.isArray(d?.muted) && d.muted.includes(friendId));
      })
      .catch(() => { if (!cancelled) setMuted(false); });
    return () => { cancelled = true; };
  }, [friendId]);

  if (muted === null) {
    return <span className={`text-surface-600 ${className}`}><Loader2 className="w-4 h-4 animate-spin" /></span>;
  }

  async function toggle() {
    const next = !muted;
    setMuted(next);              // optimistic: a toggle that lags feels broken
    setSaving(true);
    try {
      const res = next
        ? await fetch("/api/friends/mute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ friendId }),
          })
        : await fetch(`/api/friends/mute?friendId=${encodeURIComponent(friendId)}`, { method: "DELETE" });
      if (!res.ok) setMuted(!next);
    } catch {
      setMuted(!next);
    } finally {
      setSaving(false);
    }
  }

  const nome = friendName?.trim().split(/\s+/)[0];

  return (
    <button
      onClick={toggle}
      disabled={saving}
      aria-pressed={!muted}
      aria-label={muted
        ? `Ativar notificações${nome ? ` de ${nome}` : ""}`
        : `Silenciar notificações${nome ? ` de ${nome}` : ""}`}
      title={muted ? "Notificações silenciadas" : "Avisar quando treinar"}
      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 ${
        muted
          ? "text-surface-500 hover:text-surface-300"
          : "text-brand-400 hover:text-brand-300"
      } ${className}`}
    >
      {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
    </button>
  );
}
