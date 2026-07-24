import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";

// Respuesta al "gracias"/"enterado" del recordatorio de campaña: siembra la
// semilla del certificado SIN dar precios ni detalles (esos se dan en la clase).
// Solo aplica una vez por conversación y solo si la persona recibió el
// recordatorio (para no soltarlo en cualquier "gracias" suelto).
const CONFIRMA = /^\s*(gracias|enterado|enterada|ok|okay|va|listo|perfecto|👍|🙏|de acuerdo)\s*!?\.?\s*$/i;

const SIEMBRA =
  "¡De nada! 🚑 Nos vemos el 1 de agosto. Oye, al terminar la clase vas a poder obtener tu certificado oficial. Escríbeme a este mismo chat acabando la clase y te paso todos los detalles 👌";

// Devuelve true si manejó el mensaje (y ya no debe pasar al bot normal).
export async function handleCampaignReply(
  conversationId: string,
  contactId: string,
  externalId: string,
  content: string | null
): Promise<boolean> {
  if (!content || !CONFIRMA.test(content)) return false;

  const supabase = createAdminClient();
  const { data: historial } = await supabase
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(30);

  const msgs = historial ?? [];
  // ¿esta persona recibió el recordatorio de la campaña?
  const recibioRecordatorio = msgs.some(
    (m) => m.direction === "out" && (m.content ?? "").includes("confirmación de tu registro")
  );
  if (!recibioRecordatorio) return false;

  // ¿ya le sembramos la semilla del certificado antes? no repetir
  const yaSembrado = msgs.some((m) => m.direction === "out" && (m.content ?? "").includes("acabando la clase"));
  if (yaSembrado) return true; // fue un "gracias" repetido: no pasa al bot ni repite

  const { data: mensaje } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, contact_id: contactId, channel: "whatsapp", direction: "out", sender_type: "ai", content: SIEMBRA })
    .select()
    .single();
  try {
    const mid = await sendForChannel("whatsapp", externalId, SIEMBRA);
    await supabase.from("messages").update({ status: "sent", meta_message_id: mid }).eq("id", mensaje.id);
  } catch (error) {
    console.error("Error enviando siembra de certificado:", error);
    await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.id);
  }
  return true;
}
