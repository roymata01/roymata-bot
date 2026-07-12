import { createAdminClient } from "@/lib/supabase/admin";
import { nombreDelContacto, typoEnNombre } from "@/lib/inbox/nombre-saludo";
import { sendForChannel } from "@/lib/meta/send-message";
import type { Channel } from "@/types/database";

// Seguimiento fijo de la invitación por comentario (diseño de Roy): a la PRIMERA
// respuesta de la persona, el bot contesta siempre con dos mensajes — "Holaa"
// (con nombre si lo hay, y ~1 de cada 5 con falta de dedo que se corrige) y
// luego la pregunta de registro — sin pasar por el clasificador (que callaba los
// "Gracias"/"👍"). De ahí en adelante la conversación sigue con la IA normal.
const PREGUNTA_SEGUIMIENTO = "Pudiste registrarte? Si tienes dudas escríbeme con confianza";

// La invitación se reconoce por llevar el link de registro y venir del bot
// (sender_user_id null = no fue enviada a mano desde el panel).
const LINK_REGISTRO = "hemorragias-vita.vercel.app";

export async function sendInviteFollowUpIfFirstReply(
  conversationId: string,
  channel: Channel,
  contactId: string,
  externalId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: history } = await supabase
    .from("messages")
    .select("direction, sender_type, sender_user_id, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  const mensajes = history ?? [];
  const idxInvitacion = mensajes.findLastIndex(
    (m) =>
      m.direction === "out" &&
      m.sender_type === "human" &&
      !m.sender_user_id &&
      (m.content ?? "").includes(LINK_REGISTRO)
  );
  if (idxInvitacion === -1) return false;

  // Solo es "primera respuesta" si el bot no ha dicho NADA después de la
  // invitación — si ya hubo respuesta de IA, seguimiento o palabra clave,
  // la conversación ya está andando y esto no aplica.
  const botYaRespondio = mensajes.slice(idxInvitacion + 1).some((m) => m.direction === "out");
  if (botYaRespondio) return false;

  const nombre = await nombreDelContacto(contactId);
  let burbujas: string[];
  if (nombre && nombre.length >= 3 && Math.random() < 0.2) {
    burbujas = [`Holaa ${typoEnNombre(nombre)}`, `Perdon, ${nombre} jaja. ${PREGUNTA_SEGUIMIENTO}`];
  } else if (nombre) {
    burbujas = [`Holaa ${nombre}`, PREGUNTA_SEGUIMIENTO];
  } else {
    burbujas = ["Holaa", PREGUNTA_SEGUIMIENTO];
  }

  for (const texto of burbujas) {
    const { data: mensaje, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        contact_id: contactId,
        channel,
        direction: "out",
        sender_type: "ai",
        content: texto,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    try {
      const metaMessageId = await sendForChannel(channel, externalId, texto);
      await supabase.from("messages").update({ status: "sent", meta_message_id: metaMessageId }).eq("id", mensaje.id);
    } catch (error) {
      console.error(`Error enviando seguimiento de invitación por ${channel}:`, error);
      await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.id);
      return true; // no intentar el segundo si el primero falló
    }

    // pausa breve para que lleguen como dos burbujas separadas y en orden
    await new Promise((r) => setTimeout(r, 1500));
  }

  return true;
}
