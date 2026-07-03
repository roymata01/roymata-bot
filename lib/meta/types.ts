import type { Channel } from "@/types/database";

export interface InboundMessage {
  channel: Channel;
  externalId: string; // número de WhatsApp o PSID/IGSID del CLIENTE (en ecos viene de recipient, no de sender)
  displayName: string | null;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  metaMessageId: string;
  timestamp: string; // ISO
  raw: unknown;
  // true = eco de un mensaje que NOSOTROS mandamos (Roy desde la app de IG/Messenger,
  // o el propio panel/IA — esos últimos se descartan por mid duplicado al guardar)
  isEcho?: boolean;
}
