"use client";

import { useEffect, useState } from "react";
import { Footprints, Check, Loader2 } from "lucide-react";
import { SHOE_META, type Shoe, type Wear } from "@/lib/shoes";

type ShoeWithWear = Shoe & { wear: Wear };

/**
 * Which shoe this run was done in.
 *
 * One tap, and it is the only thing that makes the mileage real — a rack full
 * of shoes that never accumulate kilometres can suggest which pair to wear but
 * can never tell anyone a pair is finished.
 */
export function RunShoePicker({
  runId, initialShoeId,
}: {
  runId: string;
  initialShoeId: string | null;
}) {
  const [shoes, setShoes]     = useState<ShoeWithWear[] | null>(null);
  const [shoeId, setShoeId]   = useState<string | null>(initialShoeId);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shoes")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setShoes(((d?.shoes ?? []) as ShoeWithWear[]).filter(s => !s.retired)); })
      .catch(() => { if (!cancelled) setShoes([]); });
    return () => { cancelled = true; };
  }, []);

  // Nothing registered — nothing to ask about.
  if (!shoes || shoes.length === 0) return null;

  async function pick(id: string) {
    // Tapping the shoe already selected clears it: "actually I don't know".
    const next = id === shoeId ? null : id;
    const previous = shoeId;
    setShoeId(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shoe_id: next }),
      });
      if (!res.ok) setShoeId(previous);
    } catch {
      setShoeId(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-surface-100 text-sm flex items-center gap-1.5">
          <Footprints className="w-4 h-4 text-brand-400" /> Tênis
        </h3>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-surface-500 shrink-0" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {shoes.map(s => {
          const on = s.id === shoeId;
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              disabled={saving}
              aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 min-h-[44px] text-xs transition-colors disabled:opacity-60 ${
                on
                  ? "bg-brand-500 border-brand-400 text-white font-medium"
                  : "bg-surface-700/40 border-surface-700 text-surface-400 hover:text-surface-200"
              }`}
            >
              <span aria-hidden>{SHOE_META[s.category].emoji}</span>
              {s.name}
              {on && <Check className="w-3 h-3 shrink-0" />}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-surface-500">
        {shoeId
          ? "Toque de novo para desmarcar. Estes quilômetros contam para a vida do tênis."
          : "Marque o tênis e estes quilômetros passam a contar para a troca."}
      </p>
    </div>
  );
}
