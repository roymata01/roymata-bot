import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppPlantilla, normalizaTelMx } from "@/lib/meta/send-whatsapp-template";

export const dynamic = "force-dynamic";

// WhatsApp automático al confirmarse una VENTA de la tienda (Roy 17-oct):
// el webhook de Stripe en cursos.vita llama aquí y se manda la plantilla
// "confirmacion_pedido_tienda" ({{1}} nombre, {{2}} folio, {{3}} dirección).
// La conversación queda en "Por atender" con la IA APAGADA: la dirección la
// confirma el equipo en humano, no el bot.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { telefono, nombre, folio, direccion } = await req.json().catch(() => ({}));
  const tel = normalizaTelMx(String(telefono ?? ""));
  if (!tel) return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });

  const primerNombre = String(nombre ?? "").trim().split(/\s+/)[0] || "hola";
  const textoDireccion = String(direccion ?? "").trim() || "la dirección que nos diste en tu compra";

  let metaId: string;
  try {
    metaId = await sendWhatsAppPlantilla(tel, "confirmacion_pedido_tienda", [
      primerNombre,
      String(folio ?? ""),
      textoDireccion,
    ]);
  } catch (e) {
    console.error("Confirmación de pedido por WA falló:", e);
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  // Que la plática exista en la bandeja, con el mensaje enviado visible,
  // IA apagada y marcada Por atender para que el equipo siga la respuesta.
  try {
    const supabase = createAdminClient();
    const { data: contacto } = await supabase
      .from("contacts")
      .upsert(
        {
          channel: "whatsapp",
          external_id: tel,
          ...(nombre ? { display_name: String(nombre) } : {}),
          phone: tel,
        },
        { onConflict: "channel,external_id" }
      )
      .select()
      .single();
    if (contacto) {
      const { data: conversacion } = await supabase
        .from("conversations")
        .upsert({ contact_id: contacto.id, channel: "whatsapp" }, { onConflict: "contact_id,channel" })
        .select()
        .single();
      if (conversacion) {
        await supabase
          .from("conversations")
          .update({ ai_enabled: false, status: "por_atender" })
          .eq("id", conversacion.id);
        await supabase.from("messages").insert({
          conversation_id: conversacion.id,
          contact_id: contacto.id,
          channel: "whatsapp",
          direction: "out",
          sender_type: "ai",
          status: "sent",
          meta_message_id: metaId,
          content: `📦 (pedido #${folio}) Hola ${primerNombre}, somos del equipo de VITA RESCUE 🚑 Recibimos tu pedido y estamos confirmando tu dirección de envío: ${textoDireccion}. Si hay que corregir o completar algo, respóndenos por aquí.`,
        });
      }
    }
  } catch (e) {
    console.error("Confirmación WA: no se pudo registrar en la bandeja:", e);
  }

  return NextResponse.json({ ok: true, enviado_a: tel });
}
