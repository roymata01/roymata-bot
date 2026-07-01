import { createAdminClient } from "@/lib/supabase/admin";
import { ingestInboundMessage } from "@/lib/inbox/ingest-inbound-message";
import { checkEscalation } from "@/lib/ai/check-escalation";
import { generateAiReply } from "@/lib/ai/generate-reply";
import { sendWhatsAppMessage } from "@/lib/meta/send-whatsapp";
import { sendInstagramMessage } from "@/lib/meta/send-instagram";
import { sendMessengerMessage } from "@/lib/meta/send-messenger";
import type { InboundMessage } from "@/lib/meta/types";

async function sendForChannel(channel: InboundMessage["channel"], externalId: string, text: string) {
  if (channel === "whatsapp") return sendWhatsAppMessage(externalId, text);
  if (channel === "instagram") return sendInstagramMessage(externalId, text);
  return sendMessengerMessage(externalId, text);
}

export async function processInboundMessage(msg: InboundMessage) {
  const ingested = await ingestInboundMessage(msg);
  if (!ingested) return; // evento duplicado, ya procesado antes

  const { contact, conversation } = ingested;

  if (conversation.status !== "con_ia" || !conversation.ai_enabled) return;

  const supabaseCheck = createAdminClient();
  const { data: settings } = await supabaseCheck
    .from("assistant_settings")
    .select("is_paused")
    .eq("id", 1)
    .single();
  if (settings?.is_paused) return; // apagado de emergencia: guarda el mensaje, no responde

  const escalated = await checkEscalation(conversation.id, msg.content);
  if (escalated) return;

  const { messageId, replyText } = await generateAiReply(conversation.id, msg.channel, contact.id);
  if (!replyText) return;

  const supabase = createAdminClient();
  try {
    const metaMessageId = await sendForChannel(msg.channel, msg.externalId, replyText);
    await supabase.from("messages").update({ status: "sent", meta_message_id: metaMessageId }).eq("id", messageId);
  } catch (error) {
    console.error(`Error enviando respuesta de IA por ${msg.channel}:`, error);
    await supabase.from("messages").update({ status: "failed" }).eq("id", messageId);
  }
}
