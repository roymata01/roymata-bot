import { createAdminClient } from "@/lib/supabase/admin";
import { nombreDelContacto, typoEnNombre } from "@/lib/inbox/nombre-saludo";
import { sendForChannel } from "@/lib/meta/send-message";
import type { Channel } from "@/types/database";

// Disparador por palabra clave (estrategia "responde CURSO a esta historia"):
// si el mensaje ES la palabra clave (ignorando mayúsculas, acentos, emojis y
// signos), responde al instante con el mensaje del link — determinista, sin IA.
// "cuánto cuesta el curso?" NO dispara: eso lo contesta la IA con contexto.
function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9\s]/gi, "") // quita signos y emojis
    .trim()
    .toLowerCase();
}

export async function sendKeywordReplyIfMatch(
  conversationId: string,
  channel: Channel,
  contactId: string,
  externalId: string,
  content: string | null
): Promise<boolean> {
  if (!content) return false;

  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("assistant_settings").select("*").eq("id", 1).single();
  const config = settings as { keyword_trigger?: string; keyword_reply?: string; is_paused?: boolean } | null;
  if (!config?.keyword_trigger || !config.keyword_reply || config.is_paused) return false;

  if (normaliza(content) !== normaliza(config.keyword_trigger)) return false;

  // Saludo por nombre: del display_name real (Facebook) o extraído del
  // @usuario con IA (Instagram) — nunca el username crudo (regla de Roy).
  const nombre = await nombreDelContacto(contactId);

  // ~1 de cada 5, con nombre: falta de dedo en el saludo + corrección con humor
  const burbujas: string[] = [];
  if (nombre && nombre.length >= 3 && Math.random() < 0.2) {
    burbujas.push(`Hola ${typoEnNombre(nombre)}`);
    burbujas.push(`Perdon, ${nombre} jaja. ${config.keyword_reply}`);
  } else if (nombre) {
    burbujas.push(`Hola ${nombre}!`);
    burbujas.push(config.keyword_reply);
  } else {
    burbujas.push(config.keyword_reply);
  }

  for (const [i, texto] of burbujas.entries()) {
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
      console.error(`Error enviando respuesta de palabra clave por ${channel}:`, error);
      await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.id);
      break; // si falla una burbuja, no mandar las siguientes fuera de orden
    }
    if (i < burbujas.length - 1) await new Promise((r) => setTimeout(r, 1800));
  }

  return true;
}
