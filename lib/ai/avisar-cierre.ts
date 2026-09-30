import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppPlantilla } from "@/lib/meta/send-whatsapp-template";
import type { Channel } from "@/types/database";

// Alerta a Roy cuando un chat (cualquier canal) quiere CERRAR: confirmar un
// curso, agendar fecha, pagar, o hablar con Roy en persona. Nació del caso
// Marisol (30-sep-2026): la IA le prometió "Roy te llama" y ninguna alerta
// llegó porque el aviso solo existía en el circuito del cotizador por
// teléfono. La IA NUNCA debe prometer a Roy sin que a Roy le suene el cel.
//
// Corre aunque la IA esté pausada (es seguridad, no "la IA hablando") y
// nunca truena: un fallo aquí no frena la respuesta del bot.

const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";

// Pista barata antes de gastar en el clasificador: fechas, cierre, contacto.
const PISTA =
  /s[aá]bado|domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|fecha|agendar|apartar|reservar|confirm|pagar|pago|dep[oó]sito|transferencia|anticipo|factura|ll[aá]mam|m[aá]rcam|tel[eé]fono|hablar con|contratar|cotiza|el d[ií]a \d{1,2}|este \d{1,2}/i;

const CANAL_BONITO: Record<string, string> = {
  whatsapp: "chat de WhatsApp",
  instagram: "chat de Instagram",
  messenger: "chat de Messenger",
};

export async function maybeAvisarCierreARoy(
  conversationId: string,
  contactId: string,
  channel: Channel,
  content: string | null
): Promise<void> {
  try {
    const texto = (content || "").trim();
    if (!texto || !PISTA.test(texto)) return;

    const supabase = createAdminClient();

    // Anti-metralleta: una alerta por conversación cada 12 h.
    const { data: conv } = await supabase
      .from("conversations")
      .select("roy_alertado_en")
      .eq("id", conversationId)
      .maybeSingle();
    if (conv?.roy_alertado_en && Date.now() - new Date(conv.roy_alertado_en).getTime() < 12 * 3600000) return;

    // En WhatsApp, si la conversación está ligada a una cotización enviada,
    // el aviso lo da el circuito del cotizador (respuesta-wa) con el folio —
    // aquí se calla para no duplicar la alerta.
    if (channel === "whatsapp") {
      const { data: ligada } = await supabase
        .from("quote_requests")
        .select("id, cotizaciones_emitidas!inner(id)")
        .eq("conversation_id", conversationId)
        .eq("cotizaciones_emitidas.estado", "enviada")
        .limit(1);
      if (ligada?.length) return;
    }

    // El clasificador decide si de verdad quiere cerrar. Si falla, se avisa
    // igual: mejor una alerta de más que una venta perdida.
    let quiereCerrar = true;
    try {
      const { createAnthropicClient } = await import("@/lib/anthropic");
      const r = await createAnthropicClient().messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 60,
        system: `Mensaje de un prospecto en el chat de un negocio de cursos de primeros auxilios. ¿El mensaje indica que quiere CERRAR o AVANZAR una compra (confirmar un curso, proponer o apartar una fecha, pagar, pedir datos bancarios, negociar precio, o pide que Roy le llame o lo contacte)? Preguntas informativas sueltas (qué incluye, cuánto dura, dónde, saludos, agradecimientos) NO cuentan. Responde ÚNICAMENTE JSON: {"quiere_cerrar": true/false}`,
        messages: [{ role: "user", content: texto.slice(0, 800) }],
      });
      const raw = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      quiereCerrar = !!JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "")).quiere_cerrar;
    } catch (e) {
      console.error("Clasificador avisar-cierre:", e);
    }
    if (!quiereCerrar) return;

    const { data: contacto } = await supabase
      .from("contacts")
      .select("display_name, phone")
      .eq("id", contactId)
      .maybeSingle();
    const quien =
      contacto?.display_name || (contacto?.phone ? `+${contacto.phone}` : "Prospecto sin nombre");

    await sendWhatsAppPlantilla(NUMERO_ROY, "alerta_respuesta_cliente", [
      CANAL_BONITO[channel] ?? channel,
      `${quien} (quiere avanzar)`,
      texto.slice(0, 150),
    ]);
    await supabase
      .from("conversations")
      .update({ roy_alertado_en: new Date().toISOString() })
      .eq("id", conversationId);
  } catch (e) {
    console.error("maybeAvisarCierreARoy:", e);
  }
}
