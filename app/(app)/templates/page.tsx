"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CHANNELS } from "@/lib/channels";
import type { Channel, Template } from "@/types/database";

const emptyDraft = { name: "", channel: "" as Channel | "", category: "", body: "", variables: "" };

export default function TemplatesPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
    setTemplates((data as Template[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    load();
  }, [load]);

  function startEdit(t: Template) {
    setEditingId(t.id);
    setDraft({
      name: t.name,
      channel: t.channel ?? "",
      category: t.category ?? "",
      body: t.body,
      variables: t.variables.join(", "),
    });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: draft.name.trim(),
      channel: draft.channel || null,
      category: draft.category.trim() || null,
      body: draft.body.trim(),
      variables: draft.variables
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    };
    if (!payload.name || !payload.body) return;

    if (editingId) {
      await supabase.from("templates").update(payload).eq("id", editingId);
    } else {
      await supabase.from("templates").insert(payload);
    }
    resetForm();
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Borrar esta plantilla?")) return;
    await supabase.from("templates").delete().eq("id", id);
    await load();
  }

  if (loading) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h2 className="page-title">Templates</h2>
          <p className="text-[13px] text-[var(--text-2)]">
            Mensajes reutilizables para respuestas rápidas. Usa <code>{"{{variable}}"}</code> en el texto para marcar
            partes que cambian.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 card p-4">
          <h3 className="text-[13px] font-semibold">{editingId ? "Editar template" : "Nuevo template"}</h3>
          <div className="grid grid-cols-3 gap-3">
            <input
              required
              placeholder="Nombre"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="input"
            />
            <select
              value={draft.channel}
              onChange={(e) => setDraft({ ...draft, channel: e.target.value as Channel | "" })}
              className="input"
            >
              <option value="">Cualquier canal</option>
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Categoría (ej. cotización)"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="input"
            />
          </div>
          <textarea
            required
            placeholder="Texto del mensaje..."
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={4}
            className="input"
          />
          <input
            placeholder="Variables separadas por coma (ej. nombre, curso)"
            value={draft.variables}
            onChange={(e) => setDraft({ ...draft, variables: e.target.value })}
            className="input"
          />
          <div className="flex justify-end gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="btn btn-ghost">
                Cancelar
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {editingId ? "Guardar cambios" : "Crear template"}
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold">{t.name}</p>
                  <p className="text-[11px] text-[var(--text-3)]">
                    {t.channel ? CHANNELS.find((c) => c.key === t.channel)?.label : "Cualquier canal"}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => startEdit(t)} className="btn btn-ghost !px-2.5 !py-1 !text-xs">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="btn btn-danger !px-2.5 !py-1 !text-xs">
                    Borrar
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{t.body}</p>
            </div>
          ))}
          {templates.length === 0 && <p className="text-[13px] text-[var(--text-3)]">Todavía no tienes templates.</p>}
        </div>
      </div>
    </div>
  );
}
