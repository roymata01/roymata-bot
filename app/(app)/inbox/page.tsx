"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CHANNELS } from "@/lib/channels";
import { RedSocialIcon } from "@/components/RedSocialIcon";
import { ConversationListItem, type QuienHablo, type CotizacionResumen } from "@/components/ConversationListItem";
import { ChatPanel } from "@/components/ChatPanel";
import type { Channel, Contact, Conversation, Message } from "@/types/database";

// Inbox rediseñado (2026-09-20, aprobado por Roy): la bandeja se divide en
// 3 zonas por urgencia — 🔴 te necesitan, 🟡 las llevas tú, 🟢 el bot las
// atiende — y abre por default mostrando SOLO lo que requiere a Roy.

type ConversationWithContact = Conversation & { contact: Contact };
type Modo = "urgentes" | "todas" | "cotizadas" | "personales";

const ZONAS = [
  { key: "roja", titulo: "🔴 TE NECESITAN", clase: "text-[#e5484d]" },
  { key: "ambar", titulo: "🟡 LAS LLEVAS TÚ", clase: "text-[#f0b429]" },
  { key: "verde", titulo: "🟢 EL BOT LAS ATIENDE", clase: "text-[#46b380]" },
] as const;

function zonaDe(c: Conversation): "roja" | "ambar" | "verde" {
  if (c.status === "por_atender") return "roja";
  if (c.status === "atendiendo") return "ambar";
  return "verde";
}

function quienHabloDe(c: Conversation): QuienHablo {
  const inAt = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0;
  const msgAt = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  // Si el último movimiento fue entrante (con 2s de tolerancia), habló el cliente
  if (inAt && inAt >= msgAt - 2000) return "cliente";
  return c.status === "atendiendo" ? "tu" : "bot";
}

export default function InboxPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [conversations, setConversations] = useState<ConversationWithContact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [modo, setModo] = useState<Modo>("urgentes");
  const [answeredConversationIds, setAnsweredConversationIds] = useState<Set<string>>(new Set());
  const [cotPorConversacion, setCotPorConversacion] = useState<Map<string, CotizacionResumen>>(new Map());

  // permite llegar con /inbox?c=<id> desde otras pantallas (ej. Cotizaciones)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única del query param al montar
    if (c) {
      setSelectedId(c);
      setModo("todas");
    }
  }, []);

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .order("last_message_at", { ascending: false });
    setConversations((data as ConversationWithContact[]) ?? []);
  }, [supabase]);

  const loadAnsweredConversationIds = useCallback(async () => {
    const { data } = await supabase.from("messages").select("conversation_id").eq("sender_type", "ai");
    setAnsweredConversationIds(new Set((data ?? []).map((m) => m.conversation_id as string)));
  }, [supabase]);

  // El dinero a la vista: folio y monto de la cotización de cada conversación
  const loadCotizaciones = useCallback(async () => {
    const [{ data: sols }, { data: cots }] = await Promise.all([
      supabase.from("quote_requests").select("id, conversation_id").not("conversation_id", "is", null),
      supabase
        .from("cotizaciones_emitidas")
        .select("quote_request_id, folio, total, pdf_url")
        .order("created_at", { ascending: true }),
    ]);
    const porSolicitud = new Map<string, CotizacionResumen>();
    for (const c of cots ?? []) {
      if (c.quote_request_id) porSolicitud.set(c.quote_request_id, { folio: c.folio, total: c.total, pdf_url: c.pdf_url });
    }
    const mapa = new Map<string, CotizacionResumen>();
    for (const s of sols ?? []) {
      const cot = porSolicitud.get(s.id);
      if (cot && s.conversation_id) mapa.set(s.conversation_id, cot);
    }
    setCotPorConversacion(mapa);
  }, [supabase]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages((data as Message[]) ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la bandeja
    loadConversations();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la bandeja
    loadAnsweredConversationIds();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la bandeja
    loadCotizaciones();

    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const row = (payload.new ?? payload.old) as Message | undefined;
        if (row && row.conversation_id === selectedId) loadMessages(selectedId);
        loadConversations();
        loadAnsweredConversationIds();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, selectedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga mensajes al cambiar de conversación
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!selectedId) return;
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedId).then();
  }, [selectedId, supabase]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const esPersonal = (c: ConversationWithContact) => !answeredConversationIds.has(c.id);
  const urgentesCount = conversations.filter((c) => zonaDe(c) !== "verde").length;
  const cotizadasCount = conversations.filter((c) => cotPorConversacion.has(c.id)).length;
  const personalesCount = conversations.filter(esPersonal).length;

  const filtered = conversations.filter((c) => {
    if (channelFilter !== "all" && c.channel !== channelFilter) return false;
    if (modo === "urgentes" && zonaDe(c) === "verde") return false;
    if (modo === "cotizadas" && !cotPorConversacion.has(c.id)) return false;
    if (modo === "personales" && !esPersonal(c)) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const haystack = `${c.contact.display_name ?? ""} ${c.contact.phone ?? ""} ${c.contact.external_id}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const porZona = {
    roja: filtered.filter((c) => zonaDe(c) === "roja"),
    ambar: filtered.filter((c) => zonaDe(c) === "ambar"),
    verde: filtered.filter((c) => zonaDe(c) === "verde"),
  };

  async function handleSendMessage(content: string) {
    if (!selectedId) return;
    const res = await fetch(`/api/conversations/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await loadMessages(selectedId);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo enviar el mensaje");
    }
  }

  async function handleUpdateConversation(patch: Partial<Pick<Conversation, "status" | "ai_enabled">>) {
    if (!selectedId) return;
    await supabase.from("conversations").update(patch).eq("id", selectedId);
  }

  const chipModo = (m: Modo, etiqueta: string, n?: number) => (
    <button onClick={() => setModo(m)} className={`chip num ${modo === m ? "chip-on" : ""}`}>
      {etiqueta}
      {typeof n === "number" && <span className="ml-1 text-[var(--text-3)]">{n}</span>}
    </button>
  );

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

          <div className="mb-1.5 flex flex-wrap gap-1">
            {chipModo("urgentes", "🔔 Me necesitan", urgentesCount)}
            {chipModo("todas", "Todas")}
            {chipModo("cotizadas", "💼 Cotizadas", cotizadasCount)}
            {chipModo("personales", "👤 Personales", personalesCount)}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button onClick={() => setChannelFilter("all")} className={`chip ${channelFilter === "all" ? "chip-on" : ""}`}>
              Todas las redes
            </button>
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                onClick={() => setChannelFilter(c.key)}
                title={c.label}
                className={`chip !px-1.5 ${channelFilter === c.key ? "chip-on" : ""}`}
              >
                <RedSocialIcon channel={c.key} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {ZONAS.map((z) => {
            const lista = porZona[z.key];
            if (!lista.length) return null;
            return (
              <div key={z.key}>
                <div className={`sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[10.5px] font-extrabold tracking-wider ${z.clase}`}>
                  {z.titulo}
                  <span className="num rounded-full bg-current px-1.5 text-[9.5px] leading-4">
                    <span className="text-[var(--surface)]">{lista.length}</span>
                  </span>
                </div>
                {lista.map((c) => (
                  <ConversationListItem
                    key={c.id}
                    conversation={c}
                    contact={c.contact}
                    selected={c.id === selectedId}
                    quienHablo={quienHabloDe(c)}
                    cotizacion={cotPorConversacion.get(c.id)}
                    botRespondio={answeredConversationIds.has(c.id)}
                    onClick={() => setSelectedId(c.id)}
                  />
                ))}
              </div>
            );
          })}

          {filtered.length === 0 &&
            (modo === "urgentes" && !search.trim() && channelFilter === "all" ? (
              <div className="p-6 text-center">
                <p className="text-3xl">🎉</p>
                <p className="mt-2 text-[13.5px] font-semibold">Nadie te necesita ahorita</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">El bot tiene todo bajo control.</p>
                <button onClick={() => setModo("todas")} className="btn btn-ghost mt-3 !py-1.5 text-xs">
                  Ver todas las conversaciones
                </button>
              </div>
            ) : (
              <p className="p-4 text-[13px] text-[var(--text-3)]">Sin conversaciones con ese filtro.</p>
            ))}
        </div>
      </div>

      <div className="flex-1">
        {selected ? (
          <ChatPanel
            key={selected.id}
            conversation={selected}
            contact={selected.contact}
            messages={messages}
            cotizacion={cotPorConversacion.get(selected.id)}
            onSendMessage={handleSendMessage}
            onUpdateConversation={handleUpdateConversation}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-3)]">
            Selecciona una conversación
          </div>
        )}
      </div>
    </div>
  );
}
