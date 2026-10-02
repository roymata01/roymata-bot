import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import type { Channel } from "@/types/database";

// CTA del video del Instituto VITA (oct-2026): "mándame QUIERO y te aparto
// tu lugar". Quien manda QUIERO recibe respuesta determinista al instante,
// queda apuntado en lista_espera_gen2, y se le pide contacto OBLIGATORIO
// (correo o WhatsApp). Los mensajes siguientes los completa el extractor
// de capture-lista-espera (corre siempre que la fila exista sin contacto).

const PATRON_QUIERO = /^\W{0,4}quiero\W{0,6}$/i;
const PATRON_FRASE =
  /\bquiero\b.{0,50}\b(lugar|lista|apartar|apuntar|inscribir|entrar|generaci)/i;

export async function handleQuiero(
  conversationId: string,
  contactId: string,
  channel: Channel,
  externalId: string,
  content: string | null
): Promise<boolean> {
  const texto = (content ?? "").trim();
  if (!texto || texto.length > 90) return false;
  if (!PATRON_QUIERO.test(texto) && !PATRON_FRASE.test(texto)) return false;

  const supabase = createAdminClient();

  // Ya apuntado CON contacto: solo confirmar, sin volver a pedir datos.
  const { data: existente } = await supabase
    .from("lista_espera_gen2")
    .select("id, correo, telefono")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  const yaCompleto = !!(existente?.correo || existente?.telefono);

  const { data: contacto } = await supabase
    .from("contacts")
    .select("display_name")
    .eq("id", contactId)
    .maybeSingle();

  if (!yaCompleto) {
    await supabase.from("lista_espera_gen2").upsert(
      {
        conversation_id: conversationId,
        contact_id: contactId,
        channel,
        usuario: contacto?.display_name ?? null,
        notas: "Respondió QUIERO (video del Instituto)",
        origen: "dm",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" }
    );
  }

  const burbujas = yaCompleto
    ? [
        "Ya tienes tu lugar apartado en la segunda generación 🙌 nos vemos el sábado 19 de diciembre a las 6pm en la clase gratis de presentación, te llega el recordatorio",
      ]
    : [
        "Listo! Quedas en la lista de espera de la segunda generación del Instituto VITA 🙌",
        "Para apartarte bien tu lugar dejame tu correo o tu WhatsApp, y te mando el acceso a la clase gratis de presentación, es el sábado 19 de diciembre a las 6pm",
      ];

  for (const [i, textoBurbuja] of burbujas.entries()) {
    const { data: mensaje, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        contact_id: contactId,
        channel,
        direction: "out",
        sender_type: "ai",
        content: textoBurbuja,
      })
      .select()
      .single();
    if (error) {
      console.error("handle-quiero insert:", error);
      return true; // ya hay fila en la lista; no dejar que la IA duplique
    }
    try {
      const metaId = await sendForChannel(channel, externalId, textoBurbuja);
      await supabase.from("messages").update({ status: "sent", meta_message_id: metaId }).eq("id", mensaje.id);
    } catch (e) {
      console.error("handle-quiero envío:", e);
      await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.id);
      return true;
    }
    if (i < burbujas.length - 1) await new Promise((r) => setTimeout(r, 4000));
  }
  return true;
}
