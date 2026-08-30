import { createAdminClient } from "@/lib/supabase/admin";
import { ingestInboundMessage } from "@/lib/inbox/ingest-inbound-message";
import { sendInviteFollowUpIfFirstReply } from "@/lib/inbox/send-invite-follow-up";
import { sendKeywordReplyIfMatch } from "@/lib/inbox/handle-keyword-reply";
import { handleCampaignReply } from "@/lib/inbox/handle-campaign-reply";
import { handleCotizacionWhatsApp } from "@/lib/inbox/handle-cotizacion-whatsapp";
import { checkEscalation } from "@/lib/ai/check-escalation";
import { royFollowsInstagramUser } from "@/lib/meta/check-roy-follows";
import { modoEventoHyroxActivo } from "@/lib/hyrox/config";
import { detectarFamiliarHyrox } from "@/lib/hyrox/detectar-familiar";
import { atenderFamiliarHyrox } from "@/lib/hyrox/atender-familiar";
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

  // MODO EVENTO HYROX (se prende con MODO_EVENTO_HYROX=true).
  // Durante el evento, la app de VITA RESCUE le manda alertas médicas a los
  // familiares desde este mismo número de WhatsApp. Cuando el familiar contesta
  // —angustiado— cae aquí, y el bot normal le ofrecería un curso. Este bloque lo
  // intercepta antes de todo: se identifica como sistema, confirma solo que su
  // familiar está siendo atendido y lo manda con el staff. Nada más.
  // Va DESPUÉS de la escalación a propósito: si además pidió auxilio con una
  // palabra clave de emergencia, la conversación queda marcada para Roy igual.
  if (modoEventoHyroxActivo() && msg.channel === "whatsapp") {
    const familiar = await detectarFamiliarHyrox({
      texto: msg.content,
      telefono: msg.externalId,
      conversationId: conversation.id,
    });
    if (familiar.esFamiliar) {
      console.log(`HYROX: familiar detectado (${familiar.motivo}); puesto: ${familiar.puesto ?? "desconocido"}`);
      // Pausa corta: no es momento de fingir que alguien teclea despacio.
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
      await atenderFamiliarHyrox({
        conversationId: conversation.id,
        contactId: contact.id,
        channel: msg.channel,
        externalId: msg.externalId,
        texto: msg.content,
        puesto: familiar.puesto,
      });
      return;
    }
  }

  if (escalatedByKeyword) return;

  // Regla de Roy (2026-08-13): si Roy SIGUE a la persona en Instagram, es de su
  // círculo — el bot no se activa para nada (ni keyword, ni seguimiento, ni IA);
  // el mensaje solo queda guardado para que Roy conteste él. La escalación de
  // emergencias (arriba) sí corre incluso con amigos, por seguridad.
  if (msg.channel === "instagram" && (await royFollowsInstagramUser(msg.externalId))) return;

  // Pausa humana antes de cualquier respuesta automática: nadie contesta en 1
  // segundo. La escalación de emergencias ya corrió (esa sí es instantánea).
  await new Promise((r) => setTimeout(r, 8000 + Math.random() * 7000));

  // "gracias"/"enterado" al recordatorio de campaña de WhatsApp -> siembra la
  // semilla del certificado (sin precios) y abre la puerta para el día de clase.
  if (msg.channel === "whatsapp") {
    const respondido = await handleCampaignReply(conversation.id, contact.id, msg.externalId, msg.content);
    if (respondido) return;
  }

  // "Quiero mi cotización S####" (botón del correo de cotización) -> se le
  // manda su PDF al instante y la conversación queda ligada al CRM.
  const cotizacionEnviada = await handleCotizacionWhatsApp(
    conversation.id, contact.id, msg.channel, msg.externalId, msg.content
  );
  if (cotizacionEnviada) return;

  // Palabra clave ("responde CURSO a esta historia") -> link de registro,
  // determinista. Va antes del seguimiento: si responden "curso" a la
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
  // Los mensajes personales se quedan callados en TODOS los canales para que
  // Roy conteste él. (La excepción "Messenger contesta todo" se quitó el
  // 2026-08-13 a pedido de Roy: el bot le estaba contestando conversaciones
  // personales.)
  if (category === "personal") return;

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
    // pausa larga entre burbujas (pedido de Roy): como si estuviera tecleando
    if (i < mensajes.length - 1) await new Promise((r) => setTimeout(r, 20_000));
  }
}
