import { ChannelBadge } from "@/components/ChannelBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadStatusBadge } from "@/components/LeadStatusBadge";
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
    return <img src={contact.avatar_url} alt={label} className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hover)] text-xs font-semibold text-[var(--text-2)]">
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
      className={`flex w-full items-start gap-2.5 border-b border-[var(--border)] border-l-2 px-3 py-2.5 text-left transition ${
        selected
          ? "border-l-[var(--accent)] bg-[var(--hover)]"
          : "border-l-transparent hover:bg-[var(--hover)]"
      }`}
    >
      <Avatar contact={contact} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium">
            {contact.display_name || contact.phone || contact.external_id}
          </span>
          <span className="num shrink-0 text-[11px] text-[var(--text-3)]">{formatTime(conversation.last_message_at)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{conversation.last_message_preview || "—"}</p>
        <div className="mt-1.5 flex items-center gap-2.5">
          <ChannelBadge channel={conversation.channel} />
          <StatusBadge status={conversation.status} />
          <LeadStatusBadge status={contact.lead_status} />
          {conversation.unread_count > 0 && (
            <span className="num ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
