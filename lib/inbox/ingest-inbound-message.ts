import { createAdminClient } from "@/lib/supabase/admin";
import { fetchInstagramProfile, fetchMessengerProfile } from "@/lib/meta/fetch-profile";
import type { InboundMessage } from "@/lib/meta/types";

// Idempotente: el índice único de messages(channel, meta_message_id) es la fuente
// de verdad. Si Meta reintenta el mismo evento, el insert de abajo choca y se
// descarta sin duplicar nada. contacts/conversations son upserts, así que repetirlos
// en un reintento es inofensivo — por eso el orden importa: solo se marca el evento
// como procesado (processed_webhook_events) después de guardar el mensaje con éxito.
export async function ingestInboundMessage(msg: InboundMessage) {
  const supabase = createAdminClient();

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id, display_name")
    .eq("channel", msg.channel)
    .eq("external_id", msg.externalId)
    .maybeSingle();

  let displayName = msg.displayName;
  let avatarUrl: string | null = null;
  if (!existingContact?.display_name) {
    if (msg.channel === "instagram") {
      const profile = await fetchInstagramProfile(msg.externalId);
      displayName = displayName ?? profile.displayName;
      avatarUrl = profile.avatarUrl;
    } else if (msg.channel === "messenger") {
      const profile = await fetchMessengerProfile(msg.externalId);
      displayName = displayName ?? profile.displayName;
      avatarUrl = profile.avatarUrl;
    }
  }

  const contactPayload: Record<string, unknown> = {
    channel: msg.channel,
    external_id: msg.externalId,
  };
  // last_contact_at es actividad del CLIENTE — un eco (respuesta nuestra) no cuenta
  if (!msg.isEcho) contactPayload.last_contact_at = msg.timestamp;
  if (displayName) contactPayload.display_name = displayName;
  if (avatarUrl) contactPayload.avatar_url = avatarUrl;
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

  // Si es el eco de algo que el panel/IA acaba de mandar pero cuyo mid aún no se
  // guarda (el eco puede ganarle la carrera al UPDATE post-envío), reclama esa fila
  // en vez de insertar una burbuja duplicada.
  if (msg.isEcho && msg.content) {
    const { data: claimed } = await supabase
      .from("messages")
      .update({ meta_message_id: msg.metaMessageId })
      .eq("conversation_id", conversation.id)
      .eq("direction", "out")
      .is("meta_message_id", null)
      .eq("content", msg.content)
      .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
      .select("id");
    if (claimed && claimed.length > 0) return null;
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      contact_id: contact.id,
      channel: msg.channel,
      direction: msg.isEcho ? "out" : "in",
      sender_type: msg.isEcho ? "human" : "contact",
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
