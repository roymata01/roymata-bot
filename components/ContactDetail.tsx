"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChannelBadge } from "@/components/ChannelBadge";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_ORDER } from "@/lib/inbox/lead-status";
import type { Contact, Conversation, LeadStatus } from "@/types/database";

export function ContactDetail({
  contact,
  onSaved,
}: {
  contact: Contact;
  onSaved: (tags: string[], notes: string | null, leadStatus: LeadStatus | null) => void;
}) {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tagsDraft, setTagsDraft] = useState(contact.tags.join(", "));
  const [notesDraft, setNotesDraft] = useState(contact.notes ?? "");
  const [leadStatusDraft, setLeadStatusDraft] = useState<LeadStatus | null>(contact.lead_status);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("conversations")
      .select("*")
      .eq("contact_id", contact.id)
      .then(({ data }) => setConversations((data as Conversation[]) ?? []));
  }, [supabase, contact.id]);

  async function saveContact() {
    const tags = tagsDraft
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await supabase
      .from("contacts")
      .update({ tags, notes: notesDraft || null, lead_status: leadStatusDraft })
      .eq("id", contact.id);
    onSaved(tags, notesDraft || null, leadStatusDraft);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3">
        {contact.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatares de CDN externo
          <img src={contact.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : null}
        <div>
          <h2 className="text-[15px] font-semibold">{contact.display_name || contact.phone || contact.external_id}</h2>
          <div className="mt-1 flex items-center gap-2.5">
            <ChannelBadge channel={contact.channel} />
            {contact.phone && <span className="text-[13px] text-[var(--text-2)]">{contact.phone}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <p className="label-xs">Primer contacto</p>
          <p className="num mt-1 text-[13px] font-medium">{new Date(contact.first_contact_at).toLocaleString("es-MX")}</p>
        </div>
        <div className="card p-3">
          <p className="label-xs">Último contacto</p>
          <p className="num mt-1 text-[13px] font-medium">{new Date(contact.last_contact_at).toLocaleString("es-MX")}</p>
        </div>
      </div>

      <section className="card p-4">
        <p className="label-xs mb-2.5">Estado del lead</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setLeadStatusDraft(null)}
            className={`chip ${leadStatusDraft === null ? "chip-on" : ""}`}
          >
            Sin clasificar
          </button>
          {LEAD_STATUS_ORDER.map((status) => {
            const config = LEAD_STATUS_CONFIG[status];
            const active = leadStatusDraft === status;
            return (
              <button
                key={status}
                onClick={() => setLeadStatusDraft(status)}
                className={active ? `rounded border px-2 py-[3px] text-xs font-medium ${config.className}` : "chip"}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-xs">Etiquetas (separadas por coma)</span>
          <input
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            placeholder="ej. interesado en curso, ya compró, lead frío"
            className="input"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="label-xs">Notas</span>
          <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={4} className="input" />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={saveContact} className="btn btn-primary">
            Guardar
          </button>
          {savedAt && <span className="text-[13px] font-medium text-[#46b380]">Guardado</span>}
        </div>
      </section>

      <section className="card p-4">
        <p className="label-xs mb-2">Conversaciones</p>
        {conversations.map((conv) => (
          <div key={conv.id} className="border-b border-[var(--border)] py-2 text-[13px] last:border-0">
            <p className="font-medium">{conv.last_message_preview || "—"}</p>
            <p className="num mt-0.5 text-[11px] text-[var(--text-3)]">
              {conv.status} · {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString("es-MX") : "sin mensajes"}
            </p>
          </div>
        ))}
        {conversations.length === 0 && <p className="text-[13px] text-[var(--text-3)]">Sin conversaciones.</p>}
      </section>
    </div>
  );
}
