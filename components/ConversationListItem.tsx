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

function Avatar({ contact }: { contact: Contact }) {
  const label = contact.display_name || contact.phone || contact.external_id;
  if (contact.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element -- avatares vienen de un CDN externo (Instagram/Facebook)
    return <img src={contact.avatar_url} alt={label} className="h-9 w-9 shrink-0 rounded-full border border-white/10 object-cover" />;
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-bold">
      {label.replace("@", "").slice(0, 1).toUpperCase()}
    </div>
  );
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
      className={`flex w-full items-start gap-3 border-b border-white/10 px-4 py-3 text-left transition ${
        selected ? "bg-orange-500/15" : "bg-[#141C2F] hover:bg-white/5"
      }`}
    >
      <Avatar contact={contact} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">
            {contact.display_name || contact.phone || contact.external_id}
          </span>
          <span className="shrink-0 text-xs text-slate-500">{formatTime(conversation.last_message_at)}</span>
        </div>
        <p className="mt-1 truncate text-sm text-slate-400">{conversation.last_message_preview || "—"}</p>
        <div className="mt-2 flex items-center gap-2">
          <ChannelBadge channel={conversation.channel} />
          <StatusBadge status={conversation.status} />
          {conversation.unread_count > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
