"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChannelBadge } from "@/components/ChannelBadge";
import { ContactDetail } from "@/components/ContactDetail";
import { LeadStatusBadge } from "@/components/LeadStatusBadge";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_ORDER } from "@/lib/inbox/lead-status";
import type { Contact, LeadStatus } from "@/types/database";

export default function CrmPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leadStatusFilter, setLeadStatusFilter] = useState<LeadStatus | "all">("all");

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
    if (leadStatusFilter !== "all" && c.lead_status !== leadStatusFilter) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return `${c.display_name ?? ""} ${c.phone ?? ""} ${c.external_id}`.toLowerCase().includes(needle);
  });

  const leadStatusCounts = contacts.reduce<Record<string, number>>((acc, c) => {
    if (c.lead_status) acc[c.lead_status] = (acc[c.lead_status] ?? 0) + 1;
    return acc;
  }, {});

  function handleSaved(tags: string[], notes: string | null, leadStatus: LeadStatus | null) {
    if (!selected) return;
    setContacts((prev) => prev.map((c) => (c.id === selected.id ? { ...c, tags, notes, lead_status: leadStatus } : c)));
  }

  return (
    <div className="flex h-full">
      <div className="flex w-[380px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto..."
            className="input mb-2.5"
          />
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setLeadStatusFilter("all")} className={`chip ${leadStatusFilter === "all" ? "chip-on" : ""}`}>
              Todos
            </button>
            {LEAD_STATUS_ORDER.map((status) => (
              <button
                key={status}
                onClick={() => setLeadStatusFilter(status)}
                className={`chip num ${leadStatusFilter === status ? "chip-on" : ""}`}
              >
                {LEAD_STATUS_CONFIG[status].label} <span className="text-[var(--text-3)]">{leadStatusCounts[status] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full items-center gap-2.5 border-b border-[var(--border)] border-l-2 px-3 py-2.5 text-left transition ${
                c.id === selectedId ? "border-l-[var(--accent)] bg-[var(--hover)]" : "border-l-transparent hover:bg-[var(--hover)]"
              }`}
            >
              {c.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatares de CDN externo
                <img src={c.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hover)] text-xs font-semibold text-[var(--text-2)]">
                  {(c.display_name || c.external_id).replace("@", "").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{c.display_name || c.phone || c.external_id}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <ChannelBadge channel={c.channel} />
                  <LeadStatusBadge status={c.lead_status} />
                  {c.tags.length > 0 && <span className="truncate text-[11px] text-[var(--text-3)]">{c.tags.join(", ")}</span>}
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="p-4 text-[13px] text-[var(--text-3)]">Sin contactos.</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <p className="text-[13px] text-[var(--text-3)]">Selecciona un contacto.</p>
        ) : (
          <ContactDetail key={selected.id} contact={selected} onSaved={handleSaved} />
        )}
      </div>
    </div>
  );
}
