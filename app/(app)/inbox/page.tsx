"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CHANNELS } from "@/lib/channels";
import { STATUS_ORDER, STATUS_CONFIG } from "@/lib/inbox/status";
import { ConversationListItem } from "@/components/ConversationListItem";
import { ChatPanel } from "@/components/ChatPanel";
import type { Channel, Contact, Conversation, ConversationStatus, Message } from "@/types/database";

type ConversationWithContact = Conversation & { contact: Contact };
type AiFilter = "all" | "answered" | "personal";

export default function InboxPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [conversations, setConversations] = useState<ConversationWithContact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [answeredConversationIds, setAnsweredConversationIds] = useState<Set<string>>(new Set());

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

  const filtered = conversations.filter((c) => {
    if (channelFilter !== "all" && c.channel !== channelFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    const wasAnswered = answeredConversationIds.has(c.id);
    if (aiFilter === "answered" && !wasAnswered) return false;
    if (aiFilter === "personal" && wasAnswered) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const haystack = `${c.contact.display_name ?? ""} ${c.contact.phone ?? ""} ${c.contact.external_id}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const statusCounts = conversations.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const porAtenderCount = statusCounts["por_atender"] ?? 0;
  const answeredCount = conversations.filter((c) => answeredConversationIds.has(c.id)).length;
  const personalCount = conversations.length - answeredCount;

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

  return (
    <div className="flex h-full">
      <div className="flex w-[380px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contacto..."
              className="input"
            />
            {porAtenderCount > 0 && (
              <span className="num shrink-0 rounded-md bg-[#e5484d]/15 px-2 py-1 text-[11px] font-semibold text-[#e5484d]">
                {porAtenderCount} por atender
              </span>
            )}
          </div>

          <div className="mb-1.5 flex flex-wrap gap-1">
            <button onClick={() => setChannelFilter("all")} className={`chip ${channelFilter === "all" ? "chip-on" : ""}`}>
              Todos
            </button>
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                onClick={() => setChannelFilter(c.key)}
                className={`chip ${channelFilter === c.key ? "chip-on" : ""}`}
              >
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: c.color }} />
                {c.label}
              </button>
            ))}
          </div>

          <div className="mb-1.5 flex flex-wrap gap-1">
            <button onClick={() => setStatusFilter("all")} className={`chip ${statusFilter === "all" ? "chip-on" : ""}`}>
              Todas
            </button>
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`chip num ${statusFilter === status ? "chip-on" : ""}`}
              >
                {STATUS_CONFIG[status].label} <span className="text-[var(--text-3)]">{statusCounts[status] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            <button onClick={() => setAiFilter("all")} className={`chip ${aiFilter === "all" ? "chip-on" : ""}`}>
              Todas
            </button>
            <button onClick={() => setAiFilter("answered")} className={`chip num ${aiFilter === "answered" ? "chip-on" : ""}`}>
              Negocio · bot contestó <span className="text-[var(--text-3)]">{answeredCount}</span>
            </button>
            <button onClick={() => setAiFilter("personal")} className={`chip num ${aiFilter === "personal" ? "chip-on" : ""}`}>
              Personal <span className="text-[var(--text-3)]">{personalCount}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              contact={c.contact}
              selected={c.id === selectedId}
              onClick={() => setSelectedId(c.id)}
            />
          ))}
          {filtered.length === 0 && <p className="p-4 text-[13px] text-[var(--text-3)]">Sin conversaciones.</p>}
        </div>
      </div>

      <div className="flex-1">
        {selected ? (
          <ChatPanel
            key={selected.id}
            conversation={selected}
            contact={selected.contact}
            messages={messages}
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
