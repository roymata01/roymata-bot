import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import { burbujasDeNodoDea, TAG_FLUJO_DEA } from "@/lib/flujo/dea";
import type { Channel } from "@/types/database";

// "DEA" mandado por MENSAJE directo (no comentario): el CTA del video hace
// que mucha gente escriba la palabra al DM en vez de comentar. Mismas
// reglas que el flujo de comentarios: se le manda el link de registro de
// una vez (ya lo pidió) y queda etiquetado en el flujo DEA.
const PATRON_DEA_DM = /^\W{0,6}dea\W{0,8}$/i;

export async function handleDeaDm(
  conversationId: string,
  contactId: string,
  channel: Channel,
  externalId: string,
  content: string | null
): Promise<boolean> {
  const texto = (content ?? "").trim();
  if (!texto || texto.length > 30 || !PATRON_DEA_DM.test(texto)) return false;

  const supabase = createAdminClient();

  // Etiqueta del flujo: activa el playbook DEA en lo que siga.
  const { data: contacto } = await supabase.from("contacts").select("tags").eq("id", contactId).maybeSingle();
  const tags = Array.from(new Set([...(contacto?.tags ?? []), TAG_FLUJO_DEA]));
  await supabase.from("contacts").update({ tags }).eq("id", contactId);

  // ¿Ya tiene el link de registro? Entonces no se repite — que la IA siga.
  const { data: conLink } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .ilike("content", "%/masterclass%")
    .limit(1);
  if (conLink?.length) return false;

  const burbujas = await burbujasDeNodoDea("dm-inicial");
  if (burbujas.length === 0) return false;

  for (const [i, burbuja] of burbujas.entries()) {
    const { data: mensaje, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        contact_id: contactId,
        channel,
        direction: "out",
        sender_type: "ai",
        content: burbuja,
      })
      .select()
      .single();
    if (error) {
      console.error("DEA por DM insert:", error);
      return true;
    }
    try {
      const metaId = await sendForChannel(channel, externalId, burbuja);
      await supabase.from("messages").update({ status: "sent", meta_message_id: metaId }).eq("id", mensaje.id);
    } catch (e) {
      console.error("DEA por DM envío:", e);
      await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.id);
      return true;
    }
    if (i < burbujas.length - 1) await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000));
  }
  return true;
}
