import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import { generarRespuestaFamiliar } from "@/lib/hyrox/responder-familiar";
import { FIRMA_RESPUESTA } from "@/lib/hyrox/config";
import type { Channel } from "@/types/database";

// Contesta a un familiar del evento y deja el mensaje guardado en el inbox,
// para que Roy vea la conversación completa desde el panel.
export async function atenderFamiliarHyrox(params: {
  conversationId: string;
  contactId: string;
  channel: Channel;
  externalId: string;
  texto: string | null;
  puesto: string | null;
}) {
  const supabase = createAdminClient();

  // Cuántas veces ya le contestamos así: sirve para no sonar a robot roto
  // cuando insiste, y para saber si toca presentarse.
  const { data: previas } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", params.conversationId)
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(20);
  const respuestasPrevias = (previas ?? []).filter((m) =>
    ((m.content as string) ?? "").includes(FIRMA_RESPUESTA)
  ).length;

  const { texto, intencion } = await generarRespuestaFamiliar({
    texto: params.texto,
    puesto: params.puesto,
    esPrimeraRespuesta: respuestasPrevias === 0,
    respuestasPrevias,
  });

  const { data: fila, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: params.conversationId,
      contact_id: params.contactId,
      channel: params.channel,
      direction: "out",
      sender_type: "ai",
      content: texto,
    })
    .select()
    .single();
  if (error) throw error;

  try {
    const metaMessageId = await sendForChannel(params.channel, params.externalId, texto);
    await supabase.from("messages").update({ status: "sent", meta_message_id: metaMessageId }).eq("id", fila.id);
  } catch (err) {
    console.error("HYROX: no se pudo enviar la respuesta al familiar:", err);
    await supabase.from("messages").update({ status: "failed" }).eq("id", fila.id);
  }

  return { texto, intencion, respuestasPrevias };
}
