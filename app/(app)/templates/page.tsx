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

  if (loading) return <div className="p-6 text-sm text-neutral-500">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold">Templates</h2>
          <p className="text-sm text-neutral-600">
            Mensajes reutilizables para respuestas rápidas. Usa <code>{"{{variable}}"}</code> en el texto para marcar
            partes que cambian.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border-2 border-black bg-white p-4">
          <h3 className="font-bold">{editingId ? "Editar template" : "Nuevo template"}</h3>
          <div className="grid grid-cols-3 gap-3">
            <input
              required
              placeholder="Nombre"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="rounded-lg border-2 border-black px-2 py-1.5 text-sm"
            />
            <select
              value={draft.channel}
              onChange={(e) => setDraft({ ...draft, channel: e.target.value as Channel | "" })}
              className="rounded-lg border-2 border-black px-2 py-1.5 text-sm"
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
              className="rounded-lg border-2 border-black px-2 py-1.5 text-sm"
            />
          </div>
          <textarea
            required
            placeholder="Texto del mensaje..."
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={4}
            className="rounded-lg border-2 border-black px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Variables separadas por coma (ej. nombre, curso)"
            value={draft.variables}
            onChange={(e) => setDraft({ ...draft, variables: e.target.value })}
            className="rounded-lg border-2 border-black px-2 py-1.5 text-sm"
          />
          <div className="flex justify-end gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border-2 border-black px-3 py-1.5 text-sm font-semibold">
                Cancelar
              </button>
            )}
            <button type="submit" className="rounded-lg border-2 border-black bg-black px-4 py-1.5 text-sm font-semibold text-white">
              {editingId ? "Guardar cambios" : "Crear template"}
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border-2 border-black bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-neutral-500">
                    {t.channel ? CHANNELS.find((c) => c.key === t.channel)?.label : "Cualquier canal"}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => startEdit(t)} className="rounded-lg border-2 border-black px-3 py-1 text-xs font-semibold hover:bg-neutral-100">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="rounded-lg border-2 border-black px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                    Borrar
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{t.body}</p>
            </div>
          ))}
          {templates.length === 0 && <p className="text-sm text-neutral-500">Todavía no tienes templates.</p>}
        </div>
      </div>
    </div>
  );
}
