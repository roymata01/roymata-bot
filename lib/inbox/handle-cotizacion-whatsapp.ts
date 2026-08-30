import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import type { Channel } from "@/types/database";

// "Quiero mi cotización S11064 por WhatsApp": el correo de la cotización trae
// un botón que abre el chat con ese mensaje ya escrito. El cliente lo manda
// (con eso Meta abre la ventana de 24 h) y aquí se le contesta al instante con
// su cotización. Determinista, va antes de la IA: para esto no hay mejor
// respuesta que el PDF.
//
// El folio viaja en el propio mensaje; solo lo tiene quien recibió el correo.

const PATRON = /cotizaci[oó]n\s+s\s*-?\s*(\d{4,6})/i;
// "solicitud #a1b2c3d4": botón de la pantalla de éxito del formulario /cotizar.
// En ese momento la cotización AÚN no existe; aquí solo se liga el chat a la
// solicitud y se confirma — cuando Roy la envíe, saldrá también por WhatsApp.
const PATRON_SOLICITUD = /solicitud\s*#\s*([a-f0-9]{6,12})/i;

export async function handleCotizacionWhatsApp(
  conversationId: string,
  contactId: string,
  channel: Channel,
  externalId: string,
  content: string | null
): Promise<boolean> {
  if (!content) return false;

  // ¿Es la activación desde el formulario (aún sin folio)?
  const ms = content.match(PATRON_SOLICITUD);
  if (ms) return await ligarSolicitud(conversationId, contactId, channel, externalId, ms[1].toLowerCase());

  const m = content.match(PATRON);
  if (!m) return false;
  const folio = Number(m[1]);

  const supabase = createAdminClient();
  const { data: cot } = await supabase
    .from("cotizaciones_emitidas")
    .select("id, folio, dirigida, num_personas, total, pdf_url, estado, quote_request_id")
    .eq("folio", folio)
    .maybeSingle();
  // Sin cotización o aún en borrador: que siga la IA normal (sabrá preguntar).
  if (!cot || cot.estado === "borrador" || !cot.pdf_url) return false;

  // Una sola vez por conversación y folio: si vuelve a mandar el mismo texto,
  // que conteste la IA en lugar de repetir el PDF como perico.
  const { data: previo } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .ilike("content", `%S${cot.folio}%`)
    .limit(1)
    .maybeSingle();
  if (previo) return false;

  const personas = cot.num_personas ? ` para ${cot.num_personas} personas` : "";
  const texto =
    `Listo! Aqui esta tu cotizacion S${cot.folio}${personas} 📄\n${cot.pdf_url}\n\n` +
    `Cualquier duda o si quieres ajustar algo (fecha, numero de personas, presupuesto), ` +
    `dime por aqui con confianza 💪`;

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
  if (error) { console.error("cotizacion-whatsapp insert:", error); return false; }

  try {
    const metaId = await sendForChannel(channel, externalId, texto);
    await supabase.from("messages").update({ status: "sent", meta_message_id: metaId }).eq("id", mensaje.id);
  } catch (e) {
    console.error("cotizacion-whatsapp envío:", e);
    return false;
  }

  // Liga la conversación a la solicitud, para que Roy vea el hilo en su CRM.
  if (cot.quote_request_id) {
    await supabase
      .from("quote_requests")
      .update({ conversation_id: conversationId, contact_id: contactId })
      .eq("id", cot.quote_request_id)
      .is("conversation_id", null);
  }
  return true;
}


async function ligarSolicitud(
  conversationId: string,
  contactId: string,
  channel: Channel,
  externalId: string,
  ref: string
): Promise<boolean> {
  const supabase = createAdminClient();
  // La referencia son los primeros caracteres del uuid sin guiones. Se busca
  // entre las solicitudes recientes: son pocas y así no hace falta castear
  // uuids en la base.
  const { data: recientes } = await supabase
    .from("quote_requests")
    .select("id, nombre, organizacion, conversation_id")
    .order("created_at", { ascending: false })
    .limit(300);
  const sol = (recientes ?? []).find((q) => String(q.id).replace(/-/g, "").startsWith(ref));
  if (!sol) return false; // referencia desconocida: que conteste la IA normal

  await supabase
    .from("quote_requests")
    .update({ conversation_id: conversationId, contact_id: contactId })
    .eq("id", sol.id);

  // Si la cotización ya existe y ya se envió, mejor entregarla de una vez.
  const { data: cot } = await supabase
    .from("cotizaciones_emitidas")
    .select("folio, pdf_url, estado")
    .eq("quote_request_id", sol.id)
    .neq("estado", "borrador")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nombre = (sol.nombre ?? "").split(/\s+/)[0] || "";
  const texto = cot?.pdf_url
    ? `Listo${nombre ? " " + nombre : ""}! Aqui esta tu cotizacion S${cot.folio} 📄\n${cot.pdf_url}\n\nCualquier duda o ajuste, dime por aqui con confianza 💪`
    : `Listo${nombre ? " " + nombre : ""}! Ya quedo activado tu WhatsApp ✅ En cuanto tu cotizacion este lista te la mando por aqui mismo, ademas de tu correo. Cualquier duda mientras tanto, aqui ando 💪`;

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
  if (error) { console.error("ligar-solicitud insert:", error); return false; }
  try {
    const metaId = await sendForChannel(channel, externalId, texto);
    await supabase.from("messages").update({ status: "sent", meta_message_id: metaId }).eq("id", mensaje.id);
  } catch (e) {
    console.error("ligar-solicitud envío:", e);
    return false;
  }
  return true;
}
