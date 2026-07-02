import { sendWhatsAppMessage } from "@/lib/meta/send-whatsapp";
import { sendInstagramMessage } from "@/lib/meta/send-instagram";
import { sendMessengerMessage } from "@/lib/meta/send-messenger";
import type { Channel } from "@/types/database";

export async function sendForChannel(channel: Channel, externalId: string, text: string): Promise<string> {
  if (channel === "whatsapp") return sendWhatsAppMessage(externalId, text);
  if (channel === "instagram") return sendInstagramMessage(externalId, text);
  return sendMessengerMessage(externalId, text);
}
