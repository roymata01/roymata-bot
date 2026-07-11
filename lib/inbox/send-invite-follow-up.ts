import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import type { Channel } from "@/types/database";

// Seguimiento fijo de la invitación por comentario (diseño de Roy): a la PRIMERA
// respuesta de la persona, el bot contesta siempre con dos mensajes — "Holaa" y
// luego la pregunta de registro — sin pasar por el clasificador (que callaba los
// "Gracias"/"👍"). De ahí en adelante la conversación sigue con la IA normal.
const MENSAJES_SEGUIMIENTO = ["Holaa", "Pudiste registrarte? Si tienes dudas escríbeme con confianza"];

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
  const hayInvitacion = mensajes.some(
    (m) =>
      m.direction === "out" &&
      m.sender_type === "human" &&
      !m.sender_user_id &&
      (m.content ?? "").includes(LINK_REGISTRO)
  );
  if (!hayInvitacion) return false;

  const seguimientoYaEnviado = mensajes.some(
    (m) => m.direction === "out" && (m.content ?? "").includes("Pudiste registrarte")
  );
  if (seguimientoYaEnviado) return false;

  for (const texto of MENSAJES_SEGUIMIENTO) {
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
