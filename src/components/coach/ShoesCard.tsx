"use client";

import { useEffect, useState } from "react";
import { Footprints, Loader2, Plus, Trash2, Archive, ArchiveRestore, X } from "lucide-react";
import {
  SHOE_CATEGORIES, SHOE_META, type Shoe, type ShoeCategory, type Wear,
} from "@/lib/shoes";

type ShoeWithWear = Shoe & { wear: Wear };

const WEAR_STYLE: Record<Wear["status"], { bar: string; text: string }> = {
  novo:     { bar: "bg-green-500",  text: "text-surface-500" },
  rodando:  { bar: "bg-green-500",  text: "text-surface-500" },
  atencao:  { bar: "bg-yellow-500", text: "text-yellow-400" },
  trocar:   { bar: "bg-red-500",    text: "text-red-400" },
};

/**
 * The athlete's shoe rack.
 *
 * Registering a shoe is what turns "corra 5×1000" into "corra 5×1000 no
 * Endorphin" — and it is also the only way the app can ever say a pair is
 * finished, which is the warning that arrives too late when nobody counts.
 */
export function ShoesCard() {
  const [shoes, setShoes]   = useState<ShoeWithWear[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/shoes");
      const d = res.ok ? await res.json() : null;
      setShoes((d?.shoes ?? []) as ShoeWithWear[]);
    } catch {
      setShoes([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Não foi possível salvar.");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Falha na conexão.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!shoes) {
    return (
      <div className="card p-4 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando tênis…
      </div>
    );
  }

  const active  = shoes.filter(s => !s.retired);
  const retired = shoes.filter(s => s.retired);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-surface-100 text-sm flex items-center gap-1.5">
            <Footprints className="w-4 h-4 text-brand-400" /> Seus tênis
          </h3>
          <p className="text-[11px] text-surface-500">
            O plano sugere qual usar em cada treino
          </p>
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-surface-500 shrink-0" />}
      </div>

      {active.length === 0 && !adding && (
        <p className="text-[11px] text-surface-500 leading-relaxed">
          Cadastre seus tênis e o treinador passa a dizer qual calçar em cada sessão —
          guardando a placa para prova, pré-prova e teste de 3 km.
        </p>
      )}

      <div className="space-y-2">
        {active.map(s => (
          <ShoeRow
            key={s.id}
            shoe={s}
            disabled={busy}
            onRetire={() => send(`/api/shoes/${s.id}`, "PATCH", { retired: true })}
            onDelete={() => send(`/api/shoes/${s.id}`, "DELETE")}
          />
        ))}
      </div>

      {adding ? (
        <ShoeForm
          disabled={busy}
          onCancel={() => setAdding(false)}
          onSave={async shoe => {
            if (await send("/api/shoes", "POST", shoe)) setAdding(false);
          }}
        />
      ) : (
        <button onClick={() => setAdding(true)} disabled={busy} className="btn-secondary w-full">
          <Plus className="w-4 h-4" /> Adicionar tênis
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {retired.length > 0 && (
        <div className="pt-1 border-t border-surface-700">
          <button
            onClick={() => setShowRetired(v => !v)}
            className="text-[11px] text-surface-500 hover:text-surface-300 min-h-[44px] w-full text-left"
          >
            {showRetired ? "Esconder" : "Ver"} aposentados ({retired.length})
          </button>
          {showRetired && (
            <div className="space-y-2">
              {retired.map(s => (
                <ShoeRow
                  key={s.id}
                  shoe={s}
                  disabled={busy}
                  onRetire={() => send(`/api/shoes/${s.id}`, "PATCH", { retired: false })}
                  onDelete={() => send(`/api/shoes/${s.id}`, "DELETE")}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShoeRow({
  shoe, disabled, onRetire, onDelete,
}: {
  shoe: ShoeWithWear; disabled: boolean; onRetire: () => void; onDelete: () => void;
}) {
  const meta  = SHOE_META[shoe.category];
  const wear  = shoe.wear;
  const style = WEAR_STYLE[wear.status];

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${
      shoe.retired ? "border-surface-700 bg-surface-700/20 opacity-70" : "border-surface-700 bg-surface-700/30"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-surface-200 font-medium truncate">
            <span aria-hidden>{meta.emoji}</span> {shoe.name}
          </p>
          <p className="text-[10px] text-surface-500 truncate">
            {meta.label}{shoe.brand ? ` · ${shoe.brand}` : ""}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onRetire}
            disabled={disabled}
            aria-label={shoe.retired ? "Reativar" : "Aposentar"}
            className="text-surface-500 hover:text-surface-300 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
          >
            {shoe.retired ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
          <button
            onClick={onDelete}
            disabled={disabled}
            aria-label="Remover"
            className="text-surface-500 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-surface-500 tabular-nums">
            {wear.km.toLocaleString("pt-BR")} / {wear.lifespan.toLocaleString("pt-BR")} km
          </span>
          <span className={style.text}>{wear.note}</span>
        </div>
        <div className="h-1 rounded-full bg-surface-600 overflow-hidden">
          <div
            className={`h-full rounded-full ${style.bar}`}
            style={{ width: `${Math.min(100, Math.round(wear.ratio * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ShoeForm({
  disabled, onSave, onCancel,
}: {
  disabled: boolean;
  onSave: (shoe: { name: string; brand: string; category: ShoeCategory; initial_km: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName]         = useState("");
  const [brand, setBrand]       = useState("");
  const [category, setCategory] = useState<ShoeCategory>("rodagem");
  const [km, setKm]             = useState("");

  return (
    <div className="rounded-xl bg-surface-700/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
          Novo tênis
        </p>
        <button onClick={onCancel} aria-label="Cancelar" className="text-surface-500 hover:text-surface-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Modelo — ex: Novablast 5"
        className="input"
      />
      <input
        value={brand}
        onChange={e => setBrand(e.target.value)}
        placeholder="Marca (opcional)"
        className="input"
      />

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">Para quê</p>
        <div className="grid grid-cols-2 gap-1.5">
          {SHOE_CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors px-2 ${
                category === c
                  ? "bg-brand-500 text-white"
                  : "bg-surface-700/60 text-surface-400 hover:text-surface-200"
              }`}
            >
              <span aria-hidden>{SHOE_META[c].emoji}</span> {SHOE_META[c].label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-surface-500 leading-relaxed">{SHOE_META[category].hint}</p>
      </div>

      <div className="space-y-1">
        <label className="label" htmlFor="shoe-km">Quilômetros já rodados</label>
        <input
          id="shoe-km"
          type="number"
          inputMode="decimal"
          min={0}
          value={km}
          onChange={e => setKm(e.target.value)}
          placeholder="0"
          className="input"
        />
        <p className="text-[10px] text-surface-500">
          Chute serve. Sem isso um tênis de dois anos aparece como zero e o aviso de troca nunca chega.
        </p>
      </div>

      <button
        onClick={() => onSave({ name, brand, category, initial_km: Number(km) || 0 })}
        disabled={disabled || name.trim().length === 0}
        className="btn-primary w-full"
      >
        Salvar
      </button>
    </div>
  );
}
