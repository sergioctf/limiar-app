"use client";

import { useState, useEffect, useCallback } from "react";
import {
  User, Zap, Calendar, Target, Eye, AlertCircle,
  Plus, X, Loader2, Brain, RefreshCw,
} from "lucide-react";
import type { AthleteNote, AthleteNoteCategory } from "@/types";

// ─── Category config ──────────────────────────────────────────────────────────

interface CategoryConfig {
  label: string;
  icon:  React.ReactNode;
  color: string;
  bg:    string;
  border: string;
}

const CATEGORY: Record<AthleteNoteCategory, CategoryConfig> = {
  injury:       { label: "Lesões & Dores",  icon: <AlertCircle className="w-3.5 h-3.5" />, color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20"    },
  preference:   { label: "Preferências",    icon: <Zap         className="w-3.5 h-3.5" />, color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20"   },
  availability: { label: "Disponibilidade", icon: <Calendar    className="w-3.5 h-3.5" />, color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20"  },
  goal:         { label: "Objetivos",       icon: <Target      className="w-3.5 h-3.5" />, color: "text-brand-400",  bg: "bg-brand-500/10",  border: "border-brand-500/20"  },
  observation:  { label: "Observações",     icon: <Eye         className="w-3.5 h-3.5" />, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
};

const CATEGORY_ORDER: AthleteNoteCategory[] = ["goal", "injury", "preference", "availability", "observation"];

// ─── Add note form ────────────────────────────────────────────────────────────

function AddNoteForm({ onAdd }: { onAdd: (note: AthleteNote) => void }) {
  const [open,     setOpen]     = useState(false);
  const [category, setCategory] = useState<AthleteNoteCategory>("observation");
  const [content,  setContent]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch("/api/coach/memory", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ category, content: content.trim(), source: "manual" }),
      });
      const data = await res.json();
      if (res.ok && data.note) {
        onAdd(data.note as AthleteNote);
        setContent("");
        setOpen(false);
      } else {
        setError(data.error ?? "Erro ao salvar.");
      }
    } catch {
      setError("Falha na conexão.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-brand-400 transition-colors py-1 px-2 rounded-lg hover:bg-surface-700/50"
      >
        <Plus className="w-3.5 h-3.5" />
        Adicionar nota
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3 border border-surface-600">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-surface-200">Nova nota manual</span>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className="text-surface-500 hover:text-surface-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <select
        value={category}
        onChange={e => setCategory(e.target.value as AthleteNoteCategory)}
        className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500"
      >
        {CATEGORY_ORDER.map(cat => (
          <option key={cat} value={cat}>{CATEGORY[cat].label}</option>
        ))}
      </select>

      <input
        type="text"
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Descreva a nota (ex: dor no joelho esquerdo acima de 10km)"
        className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
        autoFocus
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="text-xs text-surface-500 hover:text-surface-300 px-3 py-1.5 rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!content.trim() || saving}
          className="btn-primary text-xs py-1.5 px-3"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AthleteProfileCard() {
  const [notes,   setNotes]   = useState<AthleteNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/coach/memory");
      const data = await res.json();
      if (res.ok) {
        setNotes(data.notes as AthleteNote[]);
      } else {
        setError("Tabela de memória ainda não criada — execute o SQL de setup.");
      }
    } catch {
      setError("Falha ao carregar perfil.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function handleDelete(id: string) {
    const prev = notes;
    setNotes(notes.filter(n => n.id !== id));
    try {
      const res = await fetch(`/api/coach/memory?id=${id}`, { method: "DELETE" });
      if (!res.ok) setNotes(prev); // Revert on error
    } catch {
      setNotes(prev);
    }
  }

  // Group notes by category
  const grouped = CATEGORY_ORDER.reduce<Record<AthleteNoteCategory, AthleteNote[]>>(
    (acc, cat) => {
      acc[cat] = notes.filter(n => n.category === cat);
      return acc;
    },
    {} as Record<AthleteNoteCategory, AthleteNote[]>
  );

  const hasAnyNotes = notes.length > 0;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <User className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Perfil do Atleta</h2>
            <p className="text-xs text-surface-500">
              {notes.length} nota{notes.length !== 1 ? "s" : ""} · usadas pela IA em todo plano gerado
            </p>
          </div>
        </div>
        <button
          onClick={fetchNotes}
          disabled={loading}
          title="Atualizar"
          className="text-surface-600 hover:text-surface-400 p-1.5 rounded-lg hover:bg-surface-700/50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* AI Memory explanation */}
      <div className="bg-brand-500/8 border border-brand-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Brain className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
        <p className="text-xs text-surface-400 leading-relaxed">
          Estas notas são injetadas automaticamente na IA ao gerar planos e responder perguntas.
          Novas notas são extraídas de cada conversa com o treinador.
        </p>
      </div>

      {error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <p className="text-xs text-yellow-400">{error}</p>
          <p className="text-xs text-surface-500 mt-1">
            Execute o SQL em <code className="text-surface-400">supabase/schema.sql</code> no painel do Supabase para criar as tabelas da Fase 3.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
        </div>
      )}

      {!loading && !error && !hasAnyNotes && (
        <div className="card p-6 text-center space-y-2">
          <User className="w-7 h-7 mx-auto text-surface-600 opacity-50" />
          <p className="text-sm text-surface-500">Nenhuma nota ainda</p>
          <p className="text-xs text-surface-600 max-w-xs mx-auto">
            As notas são criadas automaticamente ao conversar com o treinador, ou você pode adicionar manualmente.
          </p>
        </div>
      )}

      {/* Notes grouped by category */}
      {!loading && !error && CATEGORY_ORDER.map(cat => {
        const catNotes = grouped[cat];
        if (catNotes.length === 0) return null;
        const cfg = CATEGORY[cat];
        return (
          <div key={cat} className={`card p-4 ${cfg.bg} border ${cfg.border}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={cfg.color}>{cfg.icon}</span>
              <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>
                {cfg.label}
              </span>
              <span className={`ml-auto text-xs font-semibold ${cfg.color} bg-current/10 px-1.5 py-0.5 rounded-full`}
                style={{ color: "inherit" }}>
                {catNotes.length}
              </span>
            </div>
            <div className="space-y-2">
              {catNotes.map(note => {
                const isAuto = note.source === "pattern_detector";
                const isNew  = isAuto && new Date(note.created_at) > new Date(Date.now() - 7 * 86400000);
                return (
                  <div
                    key={note.id}
                    className="flex items-start justify-between gap-2 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-300 leading-relaxed">{note.content}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isAuto && (
                          <span className="text-[10px] text-surface-600 flex items-center gap-0.5">
                            <Brain className="w-2.5 h-2.5" /> Auto-detectado
                          </span>
                        )}
                        {isNew && (
                          <span className="text-[9px] font-bold text-red-400 uppercase tracking-wide">Novo</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(note.id)}
                      title="Remover nota"
                      className="shrink-0 text-surface-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded mt-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Add manual note */}
      {!loading && !error && (
        <AddNoteForm onAdd={note => setNotes(prev => [note, ...prev])} />
      )}
    </div>
  );
}
