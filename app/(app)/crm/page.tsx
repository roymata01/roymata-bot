"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChannelBadge } from "@/components/ChannelBadge";
import { ContactDetail } from "@/components/ContactDetail";
import type { Contact } from "@/types/database";

export default function CrmPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    const { data } = await supabase.from("contacts").select("*").order("last_contact_at", { ascending: false });
    setContacts((data as Contact[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    loadContacts();
  }, [loadContacts]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return `${c.display_name ?? ""} ${c.phone ?? ""} ${c.external_id}`.toLowerCase().includes(needle);
  });

  function handleSaved(tags: string[], notes: string | null) {
    if (!selected) return;
    setContacts((prev) => prev.map((c) => (c.id === selected.id ? { ...c, tags, notes } : c)));
  }

  return (
    <div className="flex h-full">
      <div className="flex w-96 shrink-0 flex-col border-r-2 border-black bg-white">
        <div className="border-b-2 border-black p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto..."
            className="w-full rounded-lg border-2 border-black px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full items-center gap-3 border-b border-black/10 px-4 py-3 text-left transition ${
                c.id === selectedId ? "bg-orange-100" : "bg-white hover:bg-neutral-50"
              }`}
            >
              {c.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatares de CDN externo
                <img src={c.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full border-2 border-black object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-black bg-neutral-200 text-sm font-bold">
                  {(c.display_name || c.external_id).replace("@", "").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.display_name || c.phone || c.external_id}</p>
                <div className="mt-1 flex items-center gap-2">
                  <ChannelBadge channel={c.channel} />
                  {c.tags.length > 0 && <span className="text-xs text-neutral-500">{c.tags.join(", ")}</span>}
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="p-4 text-sm text-neutral-500">Sin contactos.</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <p className="text-neutral-500">Selecciona un contacto.</p>
        ) : (
          <ContactDetail key={selected.id} contact={selected} onSaved={handleSaved} />
        )}
      </div>
    </div>
  );
}
