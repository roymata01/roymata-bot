"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CHANNELS } from "@/lib/channels";
import type { Channel, Workflow } from "@/types/database";

type ActionType = "tag" | "disable_ai" | "notify";
type TriggerType = "contains_keyword" | "emergency_keyword";

const emptyDraft = {
  name: "",
  triggerType: "contains_keyword" as TriggerType,
  channel: "" as Channel | "",
  keywords: "",
  actionType: "tag" as ActionType,
  tag: "",
  priority: 0,
};

const ACTION_LABELS: Record<ActionType, string> = {
  tag: "Etiquetar contacto",
  disable_ai: "Apagar IA y escalar (Por atender)",
  notify: "Marcar como Por atender",
};

export default function WorkflowsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("workflows").select("*").order("priority", { ascending: false });
    setWorkflows((data as Workflow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    load();
  }, [load]);

  function startEdit(w: Workflow) {
    setEditingId(w.id);
    setDraft({
      name: w.name,
      triggerType: w.trigger_type as TriggerType,
      channel: (w.trigger_config.channel as Channel) ?? "",
      keywords: (w.trigger_config.keywords ?? []).join(", "),
      actionType: w.action_type as ActionType,
      tag: (w.action_config as { tag?: string }).tag ?? "",
      priority: w.priority,
    });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function toggleActive(w: Workflow) {
    await supabase.from("workflows").update({ is_active: !w.is_active }).eq("id", w.id);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Borrar este workflow?")) return;
    await supabase.from("workflows").delete().eq("id", id);
    await load();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const keywords = draft.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (!draft.name.trim() || keywords.length === 0) return;

    const payload = {
      name: draft.name.trim(),
      priority: draft.priority,
      trigger_type: draft.triggerType,
      trigger_config: { keywords, channel: draft.channel || null },
      action_type: draft.actionType,
      action_config: draft.actionType === "tag" ? { tag: draft.tag.trim() } : {},
    };

    if (editingId) {
      await supabase.from("workflows").update(payload).eq("id", editingId);
    } else {
      await supabase.from("workflows").insert(payload);
    }
    resetForm();
    await load();
  }

  if (loading) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h2 className="page-title">Workflows</h2>
          <p className="text-[13px] text-[var(--text-2)]">
            Reglas que se evalúan en cada mensaje entrante, antes de que la IA responda: si el mensaje contiene
            ciertas palabras, etiqueta, escala o marca la conversación — sin dejar que la IA improvise.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 card p-4">
          <h3 className="text-[13px] font-semibold">{editingId ? "Editar workflow" : "Nuevo workflow"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Nombre (ej. Detectar interés en curso)"
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
          </div>

          <input
            required
            placeholder="Si el mensaje contiene (palabras separadas por coma)"
            value={draft.keywords}
            onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
            className="input"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              value={draft.actionType}
              onChange={(e) => setDraft({ ...draft, actionType: e.target.value as ActionType })}
              className="input"
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {draft.actionType === "tag" ? (
              <input
                required
                placeholder="Etiqueta a agregar (ej. interesado en curso)"
                value={draft.tag}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                className="input"
              />
            ) : (
              <input
                type="number"
                placeholder="Prioridad (mayor = se evalúa antes)"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                className="input"
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="btn btn-ghost">
                Cancelar
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {editingId ? "Guardar cambios" : "Crear workflow"}
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-3">
          {workflows.map((w) => (
            <div key={w.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold">{w.name}</p>
                  <p className="text-[11px] text-[var(--text-3)]">
                    Si contiene: {(w.trigger_config.keywords ?? []).join(", ")}
                    {w.trigger_config.channel ? ` · ${w.trigger_config.channel}` : ""}
                  </p>
                  <p className="text-[11px] text-[var(--text-3)]">→ {ACTION_LABELS[w.action_type as ActionType]}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => toggleActive(w)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                      w.is_active
                        ? "border-[#46b380]/25 bg-[#46b380]/10 text-[#46b380]"
                        : "border-[var(--border)] text-[var(--text-3)]"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${w.is_active ? "bg-[#46b380]" : "bg-[var(--text-3)]"}`} />
                    {w.is_active ? "Activo" : "Inactivo"}
                  </button>
                  <button onClick={() => startEdit(w)} className="btn btn-ghost !px-2.5 !py-1 !text-xs">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(w.id)} className="btn btn-danger !px-2.5 !py-1 !text-xs">
                    Borrar
                  </button>
                </div>
              </div>
            </div>
          ))}
          {workflows.length === 0 && <p className="text-[13px] text-[var(--text-3)]">Todavía no tienes workflows.</p>}
        </div>
      </div>
    </div>
  );
}
