import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import { sendWhatsAppPlantilla } from "@/lib/meta/send-whatsapp-template";
import type { Channel } from "@/types/database";

// "CONFERENCIA" por mensaje directo (24-nov-2026): CTA del reel "Contrata a
// Roy Mata" para dueños y directores de escuelas. Quien manda la palabra
// recibe al instante la respuesta fija (texto aprobado por Roy) y el chat
// queda "Por atender" con la IA apagada — la conferencia la cierra Roy en
// persona, la IA no la conoce y les ofrecería cursos. A Roy le llega UNA
// alerta a su WhatsApp hasta que la escuela contesta con sus datos
// (avisarDatosConferencia); la palabra sola no le avisa (pedido de Roy).
//
// Solo la palabra sola dispara ("CONFERENCIA", "conferencia!", "Conferéncia
// 🙌"): mensajes como "ame tu conferencia de Cuetzalan" siguen su camino normal.

const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";
export const TAG_CONFERENCIA = "conferencia";
export const TAG_CONFERENCIA_PENDIENTE = "conferencia-pendiente";

// Marca para reconocer en el historial que la respuesta ya salió.
const MARCA_RESPUESTA = "Vivir con Propósito";

export const BURBUJAS_CONFERENCIA = [
  "holaa muchas gracias por escribirme 🙌",
  "la conferencia se llama Vivir con Propósito y es para prepas y universidades",
  "para checar fechas me pasas porfa:\nnombre de la escuela\nciudad\nfecha tentativa\ny cuantos alumnos mas o menos",
  "en cuanto me lo mandes lo veo yo personalmente",
];

const CANAL_BONITO: Record<string, string> = {
  whatsapp: "chat de WhatsApp",
  instagram: "chat de Instagram",
  messenger: "chat de Messenger",
};

export function esPalabraConferencia(content: string | null): boolean {
  const texto = (content ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!texto || texto.length > 30) return false;
  return /^\W{0,6}conferencia\W{0,8}$/i.test(texto);
}

// Las plantillas de WhatsApp no aceptan saltos de línea ni espacios seguidos.
function limpiarParam(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

async function nombreDelContacto(contactId: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("contacts")
    .select("display_name, phone")
    .eq("id", contactId)
    .maybeSingle();
  return data?.display_name || (data?.phone ? `+${data.phone}` : "Prospecto sin nombre");
}

async function alertarARoy(channel: Channel, quien: string, texto: string) {
  await sendWhatsAppPlantilla(NUMERO_ROY, "alerta_respuesta_cliente", [
    CANAL_BONITO[channel] ?? channel,
    limpiarParam(quien, 80),
    limpiarParam(texto, 250),
  ]);
}

export async function handleConferenciaDm(
  conversationId: string,
  contactId: string,
  channel: Channel,
  externalId: string,
  content: string | null
): Promise<boolean> {
  if (!esPalabraConferencia(content)) return false;

  const supabase = createAdminClient();

  const { data: contacto } = await supabase.from("contacts").select("tags").eq("id", contactId).maybeSingle();
  const tags = Array.from(new Set([...(contacto?.tags ?? []), TAG_CONFERENCIA, TAG_CONFERENCIA_PENDIENTE]));
  await supabase.from("contacts").update({ tags }).eq("id", contactId);

  // ¿Ya se le mandó la respuesta antes? No se repite; Roy sí se entera.
  const { data: yaRespondida } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .ilike("content", `%${MARCA_RESPUESTA}%`)
    .limit(1);

  if (!yaRespondida?.length) {
    for (const [i, burbuja] of BURBUJAS_CONFERENCIA.entries()) {
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
        console.error("CONFERENCIA por DM insert:", error);
        break;
      }
      try {
        const metaId = await sendForChannel(channel, externalId, burbuja);
        await supabase.from("messages").update({ status: "sent", meta_message_id: metaId }).eq("id", mensaje.id);
      } catch (e) {
        console.error("CONFERENCIA por DM envío:", e);
        await supabase.from("messages").update({ status: "failed" }).eq("id", mensaje.id);
        break; // no mandar las siguientes fuera de orden
      }
      if (i < BURBUJAS_CONFERENCIA.length - 1) await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000));
    }
  }

  // Chat "Por atender" sin IA. A Roy NO se le avisa aquí (pedido de Roy
  // 24-nov: "no cada que ponen CONFERENCIA") — el WhatsApp sale hasta que
  // la escuela conteste con sus datos (avisarDatosConferencia).
  // (Sin roy_alertado_en: esa columna no existe en la base y tumbaría el update.)
  const { error: errorEstado } = await supabase
    .from("conversations")
    .update({ status: "por_atender", ai_enabled: false })
    .eq("id", conversationId);
  if (errorEstado) console.error("CONFERENCIA marcar por atender:", errorEstado);

  return true;
}

// ¿Lo que escribió la escuela trae al menos uno de los datos pedidos?
// Si el clasificador falla, se asume que sí: mejor un aviso de más que un
// prospecto perdido.
export async function traeDatosDeLaEscuela(texto: string): Promise<boolean> {
  try {
    const { createAnthropicClient } = await import("@/lib/anthropic");
    const r = await createAnthropicClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 30,
      system: `Le pedimos a una escuela que quiere contratar una conferencia estos datos: nombre de la escuela, ciudad, fecha tentativa y número aproximado de alumnos. ¿El mensaje trae AL MENOS UNO de esos datos (aunque sea incompleto o aproximado)? Saludos, agradecimientos, "ok", "luego te digo", emojis o preguntas sin datos NO cuentan. Responde ÚNICAMENTE JSON: {"trae_datos": true/false}`,
      messages: [{ role: "user", content: texto.slice(0, 800) }],
    });
    const raw = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return !!JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "")).trae_datos;
  } catch (e) {
    console.error("Clasificador datos de conferencia:", e);
    return true;
  }
}

// Alerta a Roy: la escuela contestó (normalmente con sus datos). Espera un
// minuto por si los manda en varios mensajes y avisa UNA vez con todo junto.
// La IA está apagada en este chat, así que nadie más le contesta: lo ve Roy.
export async function avisarDatosConferencia(params: {
  conversationId: string;
  contactId: string;
  channel: Channel;
  messageCreatedAt: string;
}): Promise<void> {
  const { conversationId, contactId, channel, messageCreatedAt } = params;
  try {
    await new Promise((r) => setTimeout(r, 60_000));
    const supabase = createAdminClient();

    // Si llegó otro mensaje después, ese run es el que avisa (con todo).
    const { data: masNuevo } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .gt("created_at", messageCreatedAt)
      .limit(1);
    if (masNuevo?.length) return;

    // Todo lo que escribió desde la respuesta automática.
    const { data: respuesta } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "out")
      .ilike("content", `%${MARCA_RESPUESTA}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    let consulta = supabase
      .from("messages")
      .select("content, created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .order("created_at", { ascending: true });
    if (respuesta?.[0]?.created_at) consulta = consulta.gt("created_at", respuesta[0].created_at);
    const { data: entrantes } = await consulta;
    const texto =
      (entrantes ?? [])
        .map((m) => m.content)
        .filter((c): c is string => !!c && !esPalabraConferencia(c))
        .join(" / ");

    // Solo se avisa cuando ya trae la info (Roy 24-nov). "ok gracias" o un
    // 👍 no cuentan: la marca de pendiente se queda y se espera al siguiente.
    if (!texto || !(await traeDatosDeLaEscuela(texto))) return;

    // Una sola vez: se quita la marca de pendiente.
    const { data: contacto } = await supabase.from("contacts").select("tags").eq("id", contactId).maybeSingle();
    const tags = (contacto?.tags ?? []).filter((t: string) => t !== TAG_CONFERENCIA_PENDIENTE);
    await supabase.from("contacts").update({ tags }).eq("id", contactId);

    const quien = await nombreDelContacto(contactId);
    await alertarARoy(channel, `${quien} (CONFERENCIA escuela)`, texto);
  } catch (e) {
    console.error("avisarDatosConferencia:", e);
  }
}
