import { createAdminClient } from "@/lib/supabase/admin";
import type { InboundMessage } from "@/lib/meta/types";

// Idempotente: el índice único de messages(channel, meta_message_id) es la fuente
// de verdad. Si Meta reintenta el mismo evento, el insert de abajo choca y se
// descarta sin duplicar nada. contacts/conversations son upserts, así que repetirlos
// en un reintento es inofensivo — por eso el orden importa: solo se marca el evento
// como procesado (processed_webhook_events) después de guardar el mensaje con éxito.
export async function ingestInboundMessage(msg: InboundMessage) {
  const supabase = createAdminClient();

  const contactPayload: Record<string, unknown> = {
    channel: msg.channel,
    external_id: msg.externalId,
    last_contact_at: msg.timestamp,
  };
  if (msg.displayName) contactPayload.display_name = msg.displayName;
  if (msg.channel === "whatsapp") contactPayload.phone = msg.externalId;

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .upsert(contactPayload, { onConflict: "channel,external_id" })
    .select()
    .single();
  if (contactError) throw contactError;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .upsert(
      { contact_id: contact.id, channel: msg.channel },
      { onConflict: "contact_id,channel" }
    )
    .select()
    .single();
  if (conversationError) throw conversationError;

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      contact_id: contact.id,
      channel: msg.channel,
      direction: "in",
      sender_type: "contact",
      content: msg.content,
      media_url: msg.mediaUrl,
      media_type: msg.mediaType,
      meta_message_id: msg.metaMessageId,
      raw_payload: msg.raw as never,
      created_at: msg.timestamp,
    })
    .select()
    .single();

  if (messageError) {
    if (messageError.code === "23505") return null; // ya procesado, es un reintento de Meta
    throw messageError;
  }

  // registro de auditoría; si ya existe (carrera improbable) se ignora
  await supabase
    .from("processed_webhook_events")
    .insert({ channel: msg.channel, event_id: msg.metaMessageId, payload: msg.raw as never });

  return { contact, conversation, message };
}
