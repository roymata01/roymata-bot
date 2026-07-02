"use client";

import { useState } from "react";
import { ChannelBadge } from "@/components/ChannelBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { Contact, Conversation, Message } from "@/types/database";

function bubbleClass(message: Message) {
  if (message.direction === "in") return "self-start bg-white border-2 border-black";
  if (message.sender_type === "ai") return "self-end bg-emerald-100 border-2 border-emerald-500";
  return "self-end bg-orange-100 border-2 border-orange-500";
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
    <div className="flex h-full flex-col bg-[#FAF8F2]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black px-5 py-3">
        <div>
          <p className="font-bold">{contact.display_name || contact.phone || contact.external_id}</p>
          <div className="mt-1 flex items-center gap-2">
            <ChannelBadge channel={conversation.channel} />
            <StatusBadge status={conversation.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHumanControlled ? (
            <button
              onClick={() => onUpdateConversation({ status: "con_ia", ai_enabled: true })}
              className="rounded-lg border-2 border-black bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Reactivar IA
            </button>
          ) : (
            <button
              onClick={() => onUpdateConversation({ status: "atendiendo", ai_enabled: false })}
              className="rounded-lg border-2 border-black bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Apagar IA y atender yo
            </button>
          )}
          {conversation.status !== "cerrada" && (
            <button
              onClick={() => onUpdateConversation({ status: "cerrada", ai_enabled: false })}
              className="rounded-lg border-2 border-black bg-white px-3 py-1.5 text-sm font-semibold hover:bg-neutral-100"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5">
        {messages.map((message) => (
          <div key={message.id} className={`flex max-w-[70%] flex-col rounded-2xl px-3 py-2 ${bubbleClass(message)}`}>
            {senderLabel(message) && (
              <span className="mb-0.5 text-[10px] font-bold uppercase text-neutral-500">{senderLabel(message)}</span>
            )}
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          </div>
        ))}
        {messages.length === 0 && <p className="text-sm text-neutral-500">Sin mensajes todavía.</p>}
      </div>

      <div className="border-t-2 border-black p-4">
        {sendError && <p className="mb-2 text-sm text-red-600">{sendError}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe tu respuesta..."
            className="flex-1 rounded-lg border-2 border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded-lg border-2 border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
