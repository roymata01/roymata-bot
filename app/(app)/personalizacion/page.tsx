"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { SettingsCard } from "@/components/SettingsCard";
import { EditModal } from "@/components/EditModal";
import {
  AlertIcon,
  BookIcon,
  BoxIcon,
  ChatIcon,
  ClockIcon,
  DocIcon,
  FilterIcon,
  IdIcon,
  PlusIcon,
  PowerIcon,
  ShieldIcon,
  SlidersIcon,
} from "@/components/icons";
import type { AssistantSettings, KnowledgeBaseSection } from "@/types/database";

const SECTION_ICONS: Record<string, React.ReactNode> = {
  identidad: <IdIcon />,
  tono: <ChatIcon />,
  servicios: <BookIcon />,
  productos: <BoxIcon />,
  reglas: <ShieldIcon />,
};

type EditTarget =
  | { type: "bot_status" }
  | { type: "relevance" }
  | { type: "model" }
  | { type: "keywords" }
  | { type: "off_hours" }
  | { type: "section"; id: string }
  | { type: "new_section" }
  | null;

export default function PersonalizacionPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [sections, setSections] = useState<KnowledgeBaseSection[]>([]);
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<EditTarget>(null);
  const [saving, setSaving] = useState(false);

  // drafts por tipo de modal
  const [draftRelevancePrompt, setDraftRelevancePrompt] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftMaxTokens, setDraftMaxTokens] = useState(500);
  const [draftKeywords, setDraftKeywords] = useState("");
  const [draftOffHours, setDraftOffHours] = useState("");
  const [draftSectionTitle, setDraftSectionTitle] = useState("");
  const [draftSectionContent, setDraftSectionContent] = useState("");

  const load = useCallback(async () => {
    const [{ data: sectionsData }, { data: settingsData }] = await Promise.all([
      supabase.from("knowledge_base_sections").select("*").order("order_index", { ascending: true }),
      supabase.from("assistant_settings").select("*").eq("id", 1).single(),
    ]);
    setSections((sectionsData as KnowledgeBaseSection[]) ?? []);
    if (settingsData) setSettings(settingsData as AssistantSettings);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    load();
  }, [load]);

  function openEdit(t: EditTarget) {
    if (!settings) return;
    if (t?.type === "relevance") setDraftRelevancePrompt(settings.relevance_filter_prompt);
    if (t?.type === "model") {
      setDraftModel(settings.model);
      setDraftMaxTokens(settings.max_tokens);
    }
    if (t?.type === "keywords") setDraftKeywords(settings.escalation_keywords.join(", "));
    if (t?.type === "off_hours") setDraftOffHours(settings.off_hours_message ?? "");
    if (t?.type === "section") {
      const section = sections.find((s) => s.id === t.id);
      setDraftSectionTitle(section?.title ?? "");
      setDraftSectionContent(section?.content ?? "");
    }
    if (t?.type === "new_section") {
      setDraftSectionTitle("Nueva sección");
      setDraftSectionContent("");
    }
    setTarget(t);
  }

  async function toggleBotPaused() {
    if (!settings) return;
    const next = !settings.is_paused;
    await supabase.from("assistant_settings").update({ is_paused: next }).eq("id", 1);
    setSettings({ ...settings, is_paused: next });
  }

  async function toggleRelevanceFilter() {
    if (!settings) return;
    const next = !settings.relevance_filter_enabled;
    await supabase.from("assistant_settings").update({ relevance_filter_enabled: next }).eq("id", 1);
    setSettings({ ...settings, relevance_filter_enabled: next });
  }

  async function toggleSectionActive(section: KnowledgeBaseSection) {
    const next = !section.is_active;
    await supabase.from("knowledge_base_sections").update({ is_active: next }).eq("id", section.id);
    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, is_active: next } : s)));
  }

  async function handleSave() {
    if (!target || !settings) return;
    setSaving(true);
    try {
      if (target.type === "relevance") {
        await supabase.from("assistant_settings").update({ relevance_filter_prompt: draftRelevancePrompt }).eq("id", 1);
        setSettings({ ...settings, relevance_filter_prompt: draftRelevancePrompt });
      } else if (target.type === "model") {
        await supabase.from("assistant_settings").update({ model: draftModel, max_tokens: draftMaxTokens }).eq("id", 1);
        setSettings({ ...settings, model: draftModel, max_tokens: draftMaxTokens });
      } else if (target.type === "keywords") {
        const keywords = draftKeywords.split(",").map((k) => k.trim()).filter(Boolean);
        await supabase.from("assistant_settings").update({ escalation_keywords: keywords }).eq("id", 1);
        setSettings({ ...settings, escalation_keywords: keywords });
      } else if (target.type === "off_hours") {
        await supabase.from("assistant_settings").update({ off_hours_message: draftOffHours || null }).eq("id", 1);
        setSettings({ ...settings, off_hours_message: draftOffHours || null });
      } else if (target.type === "section") {
        await supabase
          .from("knowledge_base_sections")
          .update({ title: draftSectionTitle, content: draftSectionContent })
          .eq("id", target.id);
        setSections((prev) =>
          prev.map((s) => (s.id === target.id ? { ...s, title: draftSectionTitle, content: draftSectionContent } : s))
        );
      } else if (target.type === "new_section") {
        const { data } = await supabase
          .from("knowledge_base_sections")
          .insert({
            section_key: `seccion_${Date.now()}`,
            title: draftSectionTitle,
            content: draftSectionContent,
            order_index: sections.length + 1,
          })
          .select()
          .single();
        if (data) setSections((prev) => [...prev, data as KnowledgeBaseSection]);
      }
      setTarget(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSection(id: string) {
    if (!confirm("¿Borrar esta sección de la base de conocimiento?")) return;
    await supabase.from("knowledge_base_sections").delete().eq("id", id);
    setSections((prev) => prev.filter((s) => s.id !== id));
    setTarget(null);
  }

  if (loading || !settings) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="page-title">Personalización</h2>
            <p className="page-sub">El comportamiento y el conocimiento del bot, editable sin tocar código.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-2)]">
            <span className={`h-1.5 w-1.5 rounded-full ${settings.is_paused ? "bg-[#e5484d]" : "bg-[#46b380]"}`} />
            {settings.is_paused ? "Agente pausado" : "Agente activo"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SettingsCard
            icon={<PowerIcon />}
            title="Estado del bot"
            preview={settings.is_paused ? "Pausado: se guardan mensajes pero no responde." : "Activo: responde en vivo a mensajes reales."}
            active={!settings.is_paused}
            onToggleActive={toggleBotPaused}
            onEdit={() => openEdit({ type: "bot_status" })}
          />
          <SettingsCard
            icon={<FilterIcon />}
            title="Clasificador de mensajes"
            preview={settings.relevance_filter_prompt}
            active={settings.relevance_filter_enabled}
            onToggleActive={toggleRelevanceFilter}
            onEdit={() => openEdit({ type: "relevance" })}
          />
          <SettingsCard
            icon={<SlidersIcon />}
            title="Modelo y respuesta"
            preview={`${settings.model} · hasta ${settings.max_tokens} tokens por respuesta`}
            onEdit={() => openEdit({ type: "model" })}
          />
          <SettingsCard
            icon={<AlertIcon />}
            title="Palabras de emergencia"
            preview={settings.escalation_keywords.join(", ")}
            onEdit={() => openEdit({ type: "keywords" })}
          />
          <SettingsCard
            icon={<ClockIcon />}
            title="Mensaje fuera de horario"
            preview={settings.off_hours_message || "No configurado"}
            onEdit={() => openEdit({ type: "off_hours" })}
          />
          {sections.map((section) => (
            <SettingsCard
              key={section.id}
              icon={SECTION_ICONS[section.section_key] ?? <DocIcon />}
              title={section.title}
              preview={section.content}
              active={section.is_active}
              onToggleActive={() => toggleSectionActive(section)}
              onEdit={() => openEdit({ type: "section", id: section.id })}
            />
          ))}
          <button
            onClick={() => openEdit({ type: "new_section" })}
            className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-white/15 text-[var(--text-3)] transition hover:border-white/30 hover:text-[var(--text-2)]"
          >
            <PlusIcon size={18} />
            <span className="text-[13px] font-medium">Agregar sección</span>
          </button>
        </div>
      </div>

      {target?.type === "bot_status" && (
        <EditModal title="Estado del bot" onClose={() => setTarget(null)} onSave={() => setTarget(null)}>
          <p className="text-[13px] text-[var(--text-2)]">
            Usa el switch de la tarjeta para pausar o activar el bot. Cuando está pausado, los mensajes se siguen
            guardando pero la IA no genera ni envía respuesta.
          </p>
        </EditModal>
      )}

      {target?.type === "relevance" && (
        <EditModal title="Clasificador de mensajes" onClose={() => setTarget(null)} onSave={handleSave} saving={saving}>
          <p className="text-xs text-[var(--text-3)]">
            Con esto Claude decide si cada mensaje es de negocio, personal, o una emergencia real — controla si la
            IA responde, se queda callada, o escala la conversación a &quot;Por atender&quot;.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Contexto para el clasificador (quién eres, tu negocio)
            <textarea
              value={draftRelevancePrompt}
              onChange={(e) => setDraftRelevancePrompt(e.target.value)}
              rows={8}
              className="input font-mono !text-xs"
            />
          </label>
        </EditModal>
      )}

      {target?.type === "model" && (
        <EditModal title="Modelo y respuesta" onClose={() => setTarget(null)} onSave={handleSave} saving={saving}>
          <label className="flex flex-col gap-1 text-sm">
            Modelo
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="input"
            >
              <option value="claude-haiku-4-5">Claude Haiku 4.5 (rápido, económico)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (más inteligente)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Máximo de tokens por respuesta
            <input
              type="number"
              value={draftMaxTokens}
              onChange={(e) => setDraftMaxTokens(Number(e.target.value))}
              className="input"
            />
          </label>
        </EditModal>
      )}

      {target?.type === "keywords" && (
        <EditModal title="Palabras de emergencia" onClose={() => setTarget(null)} onSave={handleSave} saving={saving}>
          <label className="flex flex-col gap-1 text-sm">
            Separadas por coma — apagan la IA y escalan la conversación a &quot;Por atender&quot;
            <textarea
              value={draftKeywords}
              onChange={(e) => setDraftKeywords(e.target.value)}
              rows={4}
              className="input"
            />
          </label>
        </EditModal>
      )}

      {target?.type === "off_hours" && (
        <EditModal title="Mensaje fuera de horario" onClose={() => setTarget(null)} onSave={handleSave} saving={saving}>
          <textarea
            value={draftOffHours}
            onChange={(e) => setDraftOffHours(e.target.value)}
            rows={4}
            className="input"
          />
        </EditModal>
      )}

      {(target?.type === "section" || target?.type === "new_section") && (
        <EditModal
          title={target.type === "new_section" ? "Nueva sección" : "Editar sección"}
          onClose={() => setTarget(null)}
          onSave={handleSave}
          saving={saving}
        >
          <label className="flex flex-col gap-1 text-sm">
            Título
            <input
              value={draftSectionTitle}
              onChange={(e) => setDraftSectionTitle(e.target.value)}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Contenido
            <textarea
              value={draftSectionContent}
              onChange={(e) => setDraftSectionContent(e.target.value)}
              rows={10}
              className="input"
            />
          </label>
          {target.type === "section" && (
            <button
              onClick={() => handleDeleteSection(target.id)}
              className="self-start rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold text-red-400 hover:bg-red-500/10"
            >
              Borrar sección
            </button>
          )}
        </EditModal>
      )}
    </div>
  );
}
