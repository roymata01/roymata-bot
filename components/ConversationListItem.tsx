import { ChannelBadge } from "@/components/ChannelBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { Contact, Conversation } from "@/types/database";

function formatTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export function ConversationListItem({
  conversation,
  contact,
  selected,
  onClick,
}: {
  conversation: Conversation;
  contact: Contact;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-black/10 px-4 py-3 text-left transition ${
        selected ? "bg-orange-100" : "bg-white hover:bg-neutral-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">
          {contact.display_name || contact.phone || contact.external_id}
        </span>
        <span className="shrink-0 text-xs text-neutral-500">{formatTime(conversation.last_message_at)}</span>
      </div>
      <p className="mt-1 truncate text-sm text-neutral-600">{conversation.last_message_preview || "—"}</p>
      <div className="mt-2 flex items-center gap-2">
        <ChannelBadge channel={conversation.channel} />
        <StatusBadge status={conversation.status} />
        {conversation.unread_count > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
            {conversation.unread_count}
          </span>
        )}
      </div>
    </button>
  );
}
