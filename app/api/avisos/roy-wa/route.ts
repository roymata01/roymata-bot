import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";

// Canal ÚNICO de avisos automáticos al WhatsApp de Roy (plantilla
// aviso_sistema_vita). Lo usan las automatizaciones de todo el sistema:
// vigías, reportes diarios, alarmas de fallas y recordatorios.
// Todo aviso queda también en automatizaciones_log (Admin → Automatizaciones).
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { texto, tipo, detalle } = await req.json().catch(() => ({}));
  if (!texto) return NextResponse.json({ error: "Falta texto" }, { status: 400 });

  // WhatsApp no acepta saltos de línea en parámetros de plantilla
  const param = String(texto).replace(/\s+/g, " ").trim().slice(0, 900) || "—";

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: NUMERO_ROY,
        type: "template",
        template: {
          name: "aviso_sistema_vita",
          language: { code: "es_MX" },
          components: [{ type: "body", parameters: [{ type: "text", text: param }] }],
        },
      }),
    }
  );
  const okWa = res.ok;
  if (!okWa) console.error("Aviso a Roy por WA falló:", res.status, await res.text());

  try {
    await createAdminClient().from("automatizaciones_log").insert({
      tipo: String(tipo ?? "aviso"),
      destinatario: "Roy (WhatsApp)",
      resumen: param.slice(0, 300),
      detalle: detalle ? String(detalle).slice(0, 8000) : null,
      exito: okWa,
    });
  } catch (e) {
    console.error("Aviso: no se pudo escribir el log:", e);
  }

  return NextResponse.json({ ok: okWa });
}
