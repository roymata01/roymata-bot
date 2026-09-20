import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppPlantilla, normalizaTelMx } from "@/lib/meta/send-whatsapp-template";
import { telefonoInterno } from "@/lib/cotizador/seguimiento";

// Cuando un cliente al que le enviamos cotización escribe por WhatsApp:
//  1) el mensaje se registra como respuesta ("in") en el hilo del folio —
//     con eso el seguimiento automático de esa cotización se detiene solo—, y
//  2) se le avisa a Roy a su WhatsApp personal (plantilla
//     alerta_respuesta_cliente) con un extracto, para que no tenga que abrir
//     nunca el WhatsApp del bot.
// Nunca truena: cualquier fallo se pierde en el log, no en el webhook de Meta.

const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";
const DIAS_VENTANA = 45; // solo cotizaciones recientes; lo viejo ya se enfrió

export async function avisarRespuestaCotizacionWA(externalId: string, texto: string) {
  try {
    const tel = normalizaTelMx(externalId);
    if (!tel || telefonoInterno(tel)) return;
    const contenido = (texto || "").trim();
    if (!contenido) return; // audios/imágenes: el bot los maneja aparte

    const supabase = createAdminClient();

    // ¿Este teléfono pidió cotización? (los teléfonos llegan con +52, espacios…)
    const { data: sols } = await supabase
      .from("quote_requests")
      .select("id, nombre, organizacion, telefono")
      .not("telefono", "is", null)
      .ilike("telefono", `%${tel.slice(-10)}%`);
    if (!sols?.length) return;

    // Su cotización enviada más reciente dentro de la ventana
    const desde = new Date(Date.now() - DIAS_VENTANA * 86400000).toISOString();
    const { data: cots } = await supabase
      .from("cotizaciones_emitidas")
      .select("id, folio, dirigida, created_at")
      .in("quote_request_id", sols.map((s) => s.id))
      .eq("estado", "enviada")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1);
    const cot = cots?.[0];
    if (!cot) return;

    // Anti-metralleta: si ya registramos un WhatsApp suyo en las últimas 12 h,
    // este mensaje es parte de la misma conversación — no se vuelve a avisar.
    const hace12h = new Date(Date.now() - 12 * 3600000).toISOString();
    const { data: recientes } = await supabase
      .from("cotizacion_correos")
      .select("id")
      .eq("folio", cot.folio)
      .eq("direction", "in")
      .ilike("from_email", "whatsapp:%")
      .gte("created_at", hace12h)
      .limit(1);
    const yaAvisado = !!recientes?.length;

    // Al hilo del folio (esto detiene el seguimiento por correo)
    await supabase.from("cotizacion_correos").insert({
      cotizacion_id: cot.id,
      folio: cot.folio,
      direction: "in",
      from_email: `whatsapp:+${tel}`,
      to_email: "bot-whatsapp",
      subject: "Respuesta por WhatsApp",
      body_text: contenido.slice(0, 20000),
    });

    if (yaAvisado) return;

    const quien = sols[0].nombre || sols[0].organizacion || `+${tel}`;
    await sendWhatsAppPlantilla(NUMERO_ROY, "alerta_respuesta_cliente", [
      `S${cot.folio}`,
      quien,
      contenido.slice(0, 160),
    ]);
  } catch (e) {
    console.error("avisarRespuestaCotizacionWA:", e);
  }
}
