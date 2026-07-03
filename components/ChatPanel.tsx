"use client";

import { useState } from "react";
import { ChannelBadge } from "@/components/ChannelBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { Contact, Conversation, Message } from "@/types/database";

function bubbleClass(message: Message) {
  if (message.direction === "in") return "self-start border border-[var(--border)] bg-[var(--surface-2)]";
  if (message.sender_type === "ai") return "self-end border border-[#46b380]/20 bg-[#46b380]/[0.08]";
  return "self-end border border-[var(--accent)]/25 bg-[var(--accent)]/[0.10]";
}

function senderLabel(message: Message) {
  if (message.direction === "in") return null;
  if (message.sender_type === "ai") return "IA";
  return "Tú";
}

export function ChatPanel({
  conversation,
  contact,
  messages,
  onSendMessage,
  onUpdateConversation,
}: {
  conversation: Conversation;
  contact: Contact;
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  onUpdateConversation: (patch: Partial<Pick<Conversation, "status" | "ai_enabled">>) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await onSendMessage(draft.trim());
      setDraft("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  const isHumanControlled = conversation.status === "atendiendo" || !conversation.ai_enabled;

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {contact.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatares vienen de un CDN externo (Instagram/Facebook)
            <img src={contact.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : null}
          <div>
            <p className="text-[13px] font-semibold">{contact.display_name || contact.phone || contact.external_id}</p>
            <div className="mt-0.5 flex items-center gap-2.5">
              <ChannelBadge channel={conversation.channel} />
              <StatusBadge status={conversation.status} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHumanControlled ? (
            <button onClick={() => onUpdateConversation({ status: "con_ia", ai_enabled: true })} className="btn btn-primary !py-1.5">
              Reactivar IA
            </button>
          ) : (
            <button onClick={() => onUpdateConversation({ status: "atendiendo", ai_enabled: false })} className="btn btn-ghost !py-1.5">
              Apagar IA y atender yo
            </button>
          )}
          {conversation.status !== "cerrada" && (
            <button onClick={() => onUpdateConversation({ status: "cerrada", ai_enabled: false })} className="btn btn-ghost !py-1.5">
              Cerrar
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-5 py-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex max-w-[65%] flex-col rounded-xl px-3 py-2 ${bubbleClass(message)}`}>
            {senderLabel(message) && (
              <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                {senderLabel(message)}
              </span>
            )}
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.content}</p>
          </div>
        ))}
        {messages.length === 0 && <p className="text-[13px] text-[var(--text-3)]">Sin mensajes todavía.</p>}
      </div>

      <div className="border-t border-[var(--border)] p-3">
        {sendError && <p className="mb-2 text-[13px] text-[#e5484d]">{sendError}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe tu respuesta..."
            className="input !py-2"
          />
          <button type="submit" disabled={sending || !draft.trim()} className="btn btn-primary">
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
