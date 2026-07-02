"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AssistantSettings, KnowledgeBaseSection } from "@/types/database";

export default function PersonalizacionPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [sections, setSections] = useState<KnowledgeBaseSection[]>([]);
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [keywordsDraft, setKeywordsDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [{ data: sectionsData }, { data: settingsData }] = await Promise.all([
      supabase.from("knowledge_base_sections").select("*").order("order_index", { ascending: true }),
      supabase.from("assistant_settings").select("*").eq("id", 1).single(),
    ]);
    setSections((sectionsData as KnowledgeBaseSection[]) ?? []);
    if (settingsData) {
      setSettings(settingsData as AssistantSettings);
      setKeywordsDraft(((settingsData as AssistantSettings).escalation_keywords ?? []).join(", "));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    load();
  }, [load]);

  function flashSaved() {
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  }

  async function updateSection(id: string, patch: Partial<KnowledgeBaseSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function saveSection(section: KnowledgeBaseSection) {
    await supabase
      .from("knowledge_base_sections")
      .update({
        title: section.title,
        content: section.content,
        order_index: section.order_index,
        is_active: section.is_active,
      })
      .eq("id", section.id);
    flashSaved();
  }

  async function deleteSection(id: string) {
    if (!confirm("¿Borrar esta sección de la base de conocimiento?")) return;
    await supabase.from("knowledge_base_sections").delete().eq("id", id);
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  async function addSection() {
    const { data } = await supabase
      .from("knowledge_base_sections")
      .insert({
        section_key: `seccion_${Date.now()}`,
        title: "Nueva sección",
        content: "",
        order_index: sections.length + 1,
      })
      .select()
      .single();
    if (data) setSections((prev) => [...prev, data as KnowledgeBaseSection]);
  }

  async function saveSettings() {
    if (!settings) return;
    const keywords = keywordsDraft
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    await supabase
      .from("assistant_settings")
      .update({
        model: settings.model,
        max_tokens: settings.max_tokens,
        off_hours_message: settings.off_hours_message,
        is_paused: settings.is_paused,
        escalation_keywords: keywords,
        relevance_filter_enabled: settings.relevance_filter_enabled,
        relevance_filter_prompt: settings.relevance_filter_prompt,
      })
      .eq("id", 1);
    flashSaved();
  }

  if (loading) return <div className="p-6 text-sm text-neutral-500">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold">Personalización</h2>
          <p className="text-sm text-neutral-600">
            Aquí editas lo que Claude sabe y cómo se comporta. Se usa en cada respuesta automática.
          </p>
          {savedAt && <p className="mt-1 text-sm font-medium text-emerald-700">Guardado ✓</p>}
        </div>

        {settings && (
          <section className="rounded-2xl border-2 border-black bg-white p-5">
            <h3 className="mb-3 font-bold">Configuración del asistente</h3>

            <div className="mb-3 flex items-center justify-between rounded-lg border-2 border-black bg-orange-50 px-3 py-2">
              <div>
                <p className="font-semibold">Bot pausado (apagado de emergencia)</p>
                <p className="text-xs text-neutral-600">Si está activo, se guardan los mensajes pero la IA no responde.</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, is_paused: !settings.is_paused })}
                className={`rounded-lg border-2 border-black px-3 py-1.5 text-sm font-semibold ${
                  settings.is_paused ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
                }`}
              >
                {settings.is_paused ? "Pausado" : "Activo"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Modelo
                <select
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  className="rounded-lg border-2 border-black px-2 py-1.5"
                >
                  <option value="claude-haiku-4-5">Claude Haiku 4.5 (rápido, económico)</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (más inteligente)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Máximo de tokens por respuesta
                <input
                  type="number"
                  value={settings.max_tokens}
                  onChange={(e) => setSettings({ ...settings, max_tokens: Number(e.target.value) })}
                  className="rounded-lg border-2 border-black px-2 py-1.5"
                />
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1 text-sm">
              Palabras clave de emergencia (separadas por coma) — apagan la IA y escalan la conversación
              <textarea
                value={keywordsDraft}
                onChange={(e) => setKeywordsDraft(e.target.value)}
                rows={2}
                className="rounded-lg border-2 border-black px-2 py-1.5"
              />
            </label>

            <div className="mt-3 flex items-center justify-between rounded-lg border-2 border-black bg-blue-50 px-3 py-2">
              <div>
                <p className="font-semibold">Solo contestar mensajes de negocio</p>
                <p className="text-xs text-neutral-600">
                  Antes de responder, Claude analiza si el mensaje es sobre tus servicios o es personal — si es
                  personal, no contesta (tú decides si le respondes).
                </p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, relevance_filter_enabled: !settings.relevance_filter_enabled })}
                className={`shrink-0 rounded-lg border-2 border-black px-3 py-1.5 text-sm font-semibold ${
                  settings.relevance_filter_enabled ? "bg-emerald-500 text-white" : "bg-neutral-200"
                }`}
              >
                {settings.relevance_filter_enabled ? "Activo" : "Apagado"}
              </button>
            </div>

            <label className="mt-3 flex flex-col gap-1 text-sm">
              Instrucciones del filtro de relevancia
              <textarea
                value={settings.relevance_filter_prompt}
                onChange={(e) => setSettings({ ...settings, relevance_filter_prompt: e.target.value })}
                rows={4}
                className="rounded-lg border-2 border-black px-2 py-1.5 font-mono text-xs"
              />
            </label>

            <label className="mt-3 flex flex-col gap-1 text-sm">
              Mensaje fuera de horario (opcional)
              <textarea
                value={settings.off_hours_message ?? ""}
                onChange={(e) => setSettings({ ...settings, off_hours_message: e.target.value })}
                rows={2}
                className="rounded-lg border-2 border-black px-2 py-1.5"
              />
            </label>

            <button
              onClick={saveSettings}
              className="mt-4 rounded-lg border-2 border-black bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Guardar configuración
            </button>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Base de conocimiento</h3>
            <button
              onClick={addSection}
              className="rounded-lg border-2 border-black bg-white px-3 py-1.5 text-sm font-semibold hover:bg-neutral-100"
            >
              + Agregar sección
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <div key={section.id} className="rounded-2xl border-2 border-black bg-white p-4">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={section.title}
                    onChange={(e) => updateSection(section.id, { title: e.target.value })}
                    className="flex-1 rounded-lg border-2 border-black px-2 py-1.5 text-sm font-semibold"
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={section.is_active}
                      onChange={(e) => updateSection(section.id, { is_active: e.target.checked })}
                    />
                    Activa
                  </label>
                </div>
                <textarea
                  value={section.content}
                  onChange={(e) => updateSection(section.id, { content: e.target.value })}
                  rows={5}
                  className="w-full rounded-lg border-2 border-black px-2 py-1.5 text-sm"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => deleteSection(section.id)}
                    className="rounded-lg border-2 border-black px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Borrar
                  </button>
                  <button
                    onClick={() => saveSection(section)}
                    className="rounded-lg border-2 border-black bg-black px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    Guardar sección
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
