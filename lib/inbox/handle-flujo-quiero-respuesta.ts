import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import { burbujasDeNodo, esAfirmacionCorta } from "@/lib/flujo/quiero";
import type { Channel } from "@/types/database";

// Paso determinista del FLUJO QUIERO: la persona ya recibió el DM de arranque
// ("quieres que te pase el video?") y contesta un sí corto -> el video se manda
// tal cual, sin dejar que la IA improvise otra pregunta (lección del chat
// divc_2508). Todo lo demás del embudo lo lleva la IA con el playbook.
export async function manejarRespuestaFlujoQuiero(
  conversationId: string,
  contactId: string,
  channel: Channel,
  externalId: string,
  content: string | null
): Promise<boolean> {
  if (!esAfirmacionCorta(content)) return false;

  const supabase = createAdminClient();

  // ¿Ya se le mandó el video? Entonces este "si" es de otra cosa — que la IA siga.
  const { data: conVideo } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .ilike("content", "%/heroe%")
    .limit(1);
  if (conVideo?.length) return false;

  const burbujas = await burbujasDeNodo("mandar-video");
  if (burbujas.length === 0) return false;

  for (const [i, texto] of burbujas.entries()) {
    const { data: mensaje, error } = await supabase
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
    if (error) {
      console.error("Flujo QUIERO video insert:", error);
      return true;
    }
    try {
      const metaId = await sendForChannel(channel, externalId, texto);
      await supabase.from("messages").update({ status: "sent", meta_message_id: metaId }).eq("id", mensaje.id);
    } catch (e) {
      console.error("Flujo QUIERO video envío:", e);
      await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.id);
      return true;
    }
    if (i < burbujas.length - 1) await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000));
  }
  return true;
}
