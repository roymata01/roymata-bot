import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluarYGenerar } from "@/lib/cotizador/auto";

export const maxDuration = 60;

// A quién se le avisa (el WhatsApp personal de Roy, formato 52 + 10 dígitos).
// Editable también sin deploy vía env ROY_WHATSAPP_ALERTAS en Vercel.
const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";

// Cron (cada 5 min): avisa a Roy por WhatsApp de solicitudes de cotización
// NUEVAS — tanto de chats (IG/FB/WA) como del formulario público /cotizar —
// para que las responda dentro de la ventana de 24 horas. Usa la plantilla
// UTILITY "alerta_cotizacion" (2 parámetros); si la plantilla aún no está
// aprobada, el envío falla y se reintenta en la siguiente corrida.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!NUMERO_ROY) return NextResponse.json({ ok: true, nota: "Sin número configurado, no se alerta." });

  const supabase = createAdminClient();
  const { data: nuevas } = await supabase
    .from("quote_requests")
    .select("id, nombre, organizacion, num_personas, correo, notas, conversation_id, contact:contacts(channel)")
    .eq("alertada", false)
    .order("created_at")
    .limit(10);

  const CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };
  let enviadas = 0;
  const errores: string[] = [];

  for (const q of nuevas ?? []) {
    const quien = q.organizacion || q.nombre || "Sin nombre";
    const contacto = q.contact as { channel?: string } | null;

    // NIVEL 1 del cotizador: intentar generar la cotización automáticamente.
    // Si es un caso estándar, el WhatsApp a Roy trae el botón de aprobar; si
    // no, va la alerta clásica de "hazla a mano".
    let plantilla: { name: string; components: unknown[] };
    let auto = null as Awaited<ReturnType<typeof evaluarYGenerar>> | null;
    try {
      auto = await evaluarYGenerar(q);
    } catch (e) {
      console.error("Cotizador auto:", e);
    }

    if (auto?.apto) {
      plantilla = {
        name: "cotizacion_lista_aprobar",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: `S${auto.folio}` },
              { type: "text", text: auto.resumen.slice(0, 500) },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: auto.linkAprobar }],
          },
        ],
      };
    } else {
      const origen = [
        q.num_personas ? `${q.num_personas} personas` : "personas por confirmar",
        contacto?.channel ? `vía ${CANAL[contacto.channel] || contacto.channel}` : "vía la página web",
        auto && !auto.apto ? `(manual: ${auto.razon})` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      plantilla = {
        name: "alerta_cotizacion",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: quien.slice(0, 100) },
              { type: "text", text: origen.slice(0, 100) },
            ],
          },
        ],
      };
    }

    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: NUMERO_ROY,
        type: "template",
        template: { name: plantilla.name, language: { code: "es_MX" }, components: plantilla.components },
      }),
    });
    if (res.ok) {
      await supabase.from("quote_requests").update({ alertada: true }).eq("id", q.id);
      enviadas++;
    } else {
      errores.push(`${quien}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    }

    // Respaldo por CORREO: el WhatsApp puede fallar (ventana, cobros de Meta,
    // etc.) y una cotización no se puede quedar esperando por eso.
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const cuerpo = auto?.apto
          ? `<p>Se generó sola la cotización <strong>S${auto.folio}</strong>:</p>
<p style="background:#f4f4f5;padding:12px;border-radius:8px;">${auto.resumen}</p>
<p><a href="https://sistema.vitarescue.com.mx/aprobar/${auto.linkAprobar}" style="display:inline-block;background:#1a56db;color:#fff;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none;">Revisar y aprobar →</a></p>
<p style="color:#777;font-size:13px;">Al aprobar se envía sola al cliente. Si prefieres cambiarla, hazlo desde tu panel de Cotizaciones.</p>`
          : `<p>Nueva solicitud de cotización de <strong>${quien}</strong>${q.num_personas ? ` (${q.num_personas} personas)` : ""}.</p>
<p style="color:#777;font-size:13px;">Esta hay que hacerla a mano${auto && !auto.apto ? `: ${auto.razon}` : ""}.</p>
<p><a href="https://cursos.vitarescue.com.mx/admin/cotizaciones" style="display:inline-block;background:#1a56db;color:#fff;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none;">Abrir Cotizaciones →</a></p>`;
        await resend.emails.send({
          from: "Sistema VITA <contacto@vitarescue.com.mx>",
          to: "roymataparamedic@gmail.com",
          subject: auto?.apto ? `📋 Cotización S${auto.folio} lista para aprobar — ${quien}` : `🔔 Nueva solicitud de cotización — ${quien}`,
          html: `<div style="max-width:540px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;">${cuerpo}</div>`,
        });
      }
    } catch (e) {
      console.error("Respaldo por correo de la alerta:", e);
    }
  }

  if (errores.length) console.error("Alertas de cotización con error:", errores);
  return NextResponse.json({ ok: true, pendientes: nuevas?.length ?? 0, enviadas, errores });
}
