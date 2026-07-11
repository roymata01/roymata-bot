import { createAdminClient } from "@/lib/supabase/admin";
import { ingestInboundMessage } from "@/lib/inbox/ingest-inbound-message";
import { sendInviteFollowUpIfFirstReply } from "@/lib/inbox/send-invite-follow-up";
import { checkEscalation } from "@/lib/ai/check-escalation";
import { classifyMessage } from "@/lib/ai/classify-message";
import { escalateConversation } from "@/lib/ai/escalate-conversation";
import { generateAiReply } from "@/lib/ai/generate-reply";
import { sendForChannel } from "@/lib/meta/send-message";
import { runWorkflows } from "@/lib/workflows/run-workflows";
import type { InboundMessage } from "@/lib/meta/types";

export async function processInboundMessage(msg: InboundMessage) {
  const ingested = await ingestInboundMessage(msg);
  if (!ingested) return; // evento duplicado, ya procesado antes

  // Eco: mensaje que Roy mandó desde su app de IG/Messenger — solo se guarda para
  // que la conversación se vea completa; la IA no clasifica ni responde a lo suyo.
  if (msg.isEcho) return;

  const { contact, conversation, message } = ingested;

  if (conversation.status !== "con_ia" || !conversation.ai_enabled) return;

  // La escalación (por palabra clave o por IA) y los workflows corren siempre,
  // esté pausada la IA o no — son seguridad/organización, no "la IA hablando".
  const escalatedByKeyword = await checkEscalation(conversation.id, msg.content);
  if (escalatedByKeyword) return;

  // Primera respuesta a la invitación por comentario -> seguimiento fijo
  // ("Holaa" + pregunta de registro), sin clasificador. Luego sigue la IA normal.
  const followedUp = await sendInviteFollowUpIfFirstReply(conversation.id, msg.channel, contact.id, msg.externalId);
  if (followedUp) return;

  const { blockAiReply } = await runWorkflows({
    conversationId: conversation.id,
    contactId: contact.id,
    messageId: message.id,
    channel: msg.channel,
    content: msg.content,
  });
  if (blockAiReply) return;

  const category = await classifyMessage(conversation.id, msg.content);
  if (category === "emergencia") {
    await escalateConversation(conversation.id);
    return;
  }
  if (category === "personal") return; // la IA no se mete, Roy contesta si quiere

  const supabaseCheck = createAdminClient();
  const { data: settings } = await supabaseCheck
    .from("assistant_settings")
    .select("is_paused")
    .eq("id", 1)
    .single();
  if (settings?.is_paused) return; // apagado de emergencia: guarda el mensaje, no genera ni envía respuesta

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
