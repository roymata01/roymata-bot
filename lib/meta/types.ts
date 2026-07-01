import type { Channel } from "@/types/database";

export interface InboundMessage {
  channel: Channel;
  externalId: string; // número de WhatsApp o PSID/IGSID
  displayName: string | null;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  metaMessageId: string;
  timestamp: string; // ISO
  raw: unknown;
}
