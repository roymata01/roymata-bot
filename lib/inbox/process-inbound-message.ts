import { createAdminClient } from "@/lib/supabase/admin";
import { ingestInboundMessage } from "@/lib/inbox/ingest-inbound-message";
import { sendInviteFollowUpIfFirstReply } from "@/lib/inbox/send-invite-follow-up";
import { sendKeywordReplyIfMatch } from "@/lib/inbox/handle-keyword-reply";
import { checkEscalation } from "@/lib/ai/check-escalation";
import { classifyMessage } from "@/lib/ai/classify-message";
import { maybeCaptureQuoteRequest } from "@/lib/ai/extract-quote";
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

  // Palabra clave ("responde CURSO a esta historia") -> link de registro al
  // instante, determinista. Va antes del seguimiento: si responden "curso" a la
  // invitación, el link es mejor respuesta que el "Holaa".
  const keywordMatched = await sendKeywordReplyIfMatch(conversation.id, msg.channel, contact.id, msg.externalId, msg.content);
  if (keywordMatched) return;

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

  // Cotizaciones grupales (empresa/escuela): detecta y junta los datos del
  // cliente en quote_requests para el apartado "Cotizaciones" del panel.
  // Nunca lanza — un fallo aquí no frena la respuesta.
  await maybeCaptureQuoteRequest(conversation.id, contact.id, msg.content);

  const supabaseCheck = createAdminClient();
  const { data: settings } = await supabaseCheck
    .from("assistant_settings")
    .select("is_paused")
    .eq("id", 1)
    .single();
  if (settings?.is_paused) return; // apagado de emergencia: guarda el mensaje, no genera ni envía respuesta

  const { mensajes, replyText } = await generateAiReply(conversation.id, msg.channel, contact.id);
  if (!replyText || mensajes.length === 0) return;

  const supabase = createAdminClient();
  for (const [i, mensaje] of mensajes.entries()) {
    try {
      const metaMessageId = await sendForChannel(msg.channel, msg.externalId, mensaje.text);
      await supabase.from("messages").update({ status: "sent", meta_message_id: metaMessageId }).eq("id", mensaje.messageId);
    } catch (error) {
      console.error(`Error enviando respuesta de IA por ${msg.channel}:`, error);
      await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.messageId);
      break; // si falla uno, no mandar los siguientes fuera de orden
    }
    // pausa corta entre burbujas para que lleguen en orden y se sienta humano
    if (i < mensajes.length - 1) await new Promise((r) => setTimeout(r, 1800));
  }
}
