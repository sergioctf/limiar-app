"use client";

import { useState } from "react";
import { X, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialName?: string;
  initialUsername?: string;
}

export function EditProfileModal({
  isOpen,
  onClose,
  onSuccess,
  initialName,
  initialUsername,
}: EditProfileModalProps) {
  const [name, setName] = useState(initialName || "");
  const [username, setUsername] = useState(initialUsername || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    if (!name.trim()) {
      setError("Nome é obrigatório");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: err } = await supabase
        .from("profiles")
        .update({
          name: name.trim(),
          username: username.trim() || null,
        })
        .eq("id", user.id);

      if (err) {
        // Friendly message for the unique-username conflict
        if (err.code === "23505" || /duplicate|unique/i.test(err.message)) {
          throw new Error("Esse username já está em uso. Escolha outro.");
        }
        throw err;
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar perfil");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-sm p-5 space-y-4 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-surface-100">Editar Perfil</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-surface-500 hover:text-surface-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Name field */}
        <div className="space-y-2">
          <label className="label">Nome completo</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            className="input"
            disabled={loading}
            autoFocus
          />
        </div>

        {/* Username field */}
        <div className="space-y-2">
          <label className="label">Username (opcional)</label>
          <div className="flex items-center">
            <span className="text-sm text-surface-500 mr-2">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
              placeholder="seuusername"
              className="input flex-1"
              disabled={loading}
            />
          </div>
          <p className="text-xs text-surface-600">
            Username público para compartilhamento (apenas letras, números, underscores)
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2.5 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <p className="text-xs text-green-400">Perfil atualizado com sucesso!</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-secondary flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
