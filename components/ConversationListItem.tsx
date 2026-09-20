import { RedSocialIcon } from "@/components/RedSocialIcon";
import type { Contact, Conversation } from "@/types/database";

// Tarjeta de conversación del inbox (rediseño 2026-09-20, aprobado por Roy):
// urgencia por color, logo de la red sobre el avatar, quién habló al último
// y — si el contacto tiene cotización — su folio y monto a la vista.

export type QuienHablo = "cliente" | "bot" | "tu";
export type CotizacionResumen = { folio: number; total: number | null; pdf_url?: string | null };

function formatTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function Avatar({ contact, conversation }: { contact: Contact; conversation: Conversation }) {
  const label = contact.display_name || contact.phone || contact.external_id;
  return (
    <div className="relative h-10 w-10 shrink-0">
      {contact.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatares de CDN de Meta
        <img src={contact.avatar_url} alt={label} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hover)] text-sm font-semibold text-[var(--text-2)]">
          {label.replace("@", "").slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="absolute -bottom-1 -right-1 rounded-[7px] border-2 border-[var(--surface)]">
        <RedSocialIcon channel={conversation.channel} size={17} />
      </span>
    </div>
  );
}

export function ConversationListItem({
  conversation,
  contact,
  selected,
  quienHablo,
  cotizacion,
  botRespondio,
  onClick,
}: {
  conversation: Conversation;
  contact: Contact;
  selected: boolean;
  quienHablo: QuienHablo;
  cotizacion?: CotizacionResumen;
  botRespondio: boolean;
  onClick: () => void;
}) {
  const urgente = conversation.status === "por_atender";
  const mia = conversation.status === "atendiendo";
  const delBot = !urgente && !mia;

  const zona = urgente
    ? "border-l-[3px] border-l-[#e5484d] bg-[#e5484d]/[0.06]"
    : mia
      ? "border-l-[3px] border-l-[#f0b429] bg-[#f0b429]/[0.05]"
      : "border-l-[3px] border-l-transparent opacity-[0.85]";

  const prefijo =
    quienHablo === "cliente"
      ? { texto: "Cliente:", color: "text-[#e5484d]" }
      : quienHablo === "tu"
        ? { texto: "Tú:", color: "text-[#f0b429]" }
        : { texto: "🤖 Bot:", color: "text-[#46b380]" };

  const estado =
    quienHablo === "cliente"
      ? urgente || mia
        ? { texto: "● Esperando TU respuesta", clase: "text-[#e5484d] font-semibold" }
        : botRespondio
          ? { texto: "● El bot va a responder", clase: "text-[var(--text-3)]" }
          : { texto: "● Personal · sin contestar", clase: "text-[#f0b429] font-semibold" }
      : quienHablo === "tu"
        ? { texto: "✓ Tú respondiste al último", clase: "text-[#46b380]" }
        : { texto: "✓ Bot al pendiente", clase: "text-[#46b380]" };

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 border-b border-[var(--border)] px-3 py-2.5 text-left transition ${zona} ${
        selected ? "bg-[var(--hover)]" : "hover:bg-[var(--hover)]"
      }`}
    >
      <Avatar contact={contact} conversation={conversation} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[13px] ${delBot ? "font-medium" : "font-semibold"}`}>
            {contact.display_name || contact.phone || contact.external_id}
          </span>
          <span className="num shrink-0 text-[11px] text-[var(--text-3)]">{formatTime(conversation.last_message_at)}</span>
        </div>

        {urgente && (
          <span className="mt-0.5 inline-block rounded-md bg-[#e5484d]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#e5484d]">
            🚨 Necesita tu atención
          </span>
        )}

        <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">
          <span className={`font-semibold ${prefijo.color}`}>{prefijo.texto}</span>{" "}
          {conversation.last_message_preview || "—"}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <span className={`text-[10.5px] ${estado.clase}`}>{estado.texto}</span>
          {cotizacion && (
            <span className="num ml-auto shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
              💼 S{cotizacion.folio}
              {cotizacion.total ? ` · $${Number(cotizacion.total).toLocaleString("es-MX")}` : ""}
            </span>
          )}
          {conversation.unread_count > 0 && (
            <span className={`num ${cotizacion ? "" : "ml-auto"} flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white`}>
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
