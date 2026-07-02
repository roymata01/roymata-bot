"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChannelBadge } from "@/components/ChannelBadge";
import type { Contact, Conversation } from "@/types/database";

export function ContactDetail({
  contact,
  onSaved,
}: {
  contact: Contact;
  onSaved: (tags: string[], notes: string | null) => void;
}) {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tagsDraft, setTagsDraft] = useState(contact.tags.join(", "));
  const [notesDraft, setNotesDraft] = useState(contact.notes ?? "");
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
    await supabase.from("contacts").update({ tags, notes: notesDraft || null }).eq("id", contact.id);
    onSaved(tags, notesDraft || null);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center gap-3">
        {contact.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatares de CDN externo
          <img src={contact.avatar_url} alt="" className="h-14 w-14 rounded-full border border-white/10 object-cover" />
        ) : null}
        <div>
          <h2 className="text-xl font-bold">{contact.display_name || contact.phone || contact.external_id}</h2>
          <div className="mt-1 flex items-center gap-2">
            <ChannelBadge channel={contact.channel} />
            {contact.phone && <span className="text-sm text-slate-400">{contact.phone}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-white/10 bg-[#141C2F] p-3">
          <p className="text-xs text-slate-500">Primer contacto</p>
          <p className="font-medium">{new Date(contact.first_contact_at).toLocaleString("es-MX")}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#141C2F] p-3">
          <p className="text-xs text-slate-500">Último contacto</p>
          <p className="font-medium">{new Date(contact.last_contact_at).toLocaleString("es-MX")}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#141C2F] p-4">
        <label className="flex flex-col gap-1 text-sm">
          Etiquetas (separadas por coma)
          <input
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            placeholder="ej. interesado en curso, ya compró, lead frío"
            className="rounded-lg border border-white/10 px-2 py-1.5"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          Notas
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={4}
            className="rounded-lg border border-white/10 px-2 py-1.5"
          />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={saveContact} className="rounded-lg border border-orange-500/60 bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white">
            Guardar
          </button>
          {savedAt && <span className="text-sm font-medium text-emerald-400">Guardado ✓</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#141C2F] p-4">
        <h3 className="mb-2 font-bold">Conversaciones</h3>
        {conversations.map((conv) => (
          <div key={conv.id} className="border-b border-white/10 py-2 text-sm last:border-0">
            <p className="font-medium">{conv.last_message_preview || "—"}</p>
            <p className="text-xs text-slate-500">
              {conv.status} · {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString("es-MX") : "sin mensajes"}
            </p>
          </div>
        ))}
        {conversations.length === 0 && <p className="text-sm text-slate-500">Sin conversaciones.</p>}
      </section>
    </div>
  );
}
