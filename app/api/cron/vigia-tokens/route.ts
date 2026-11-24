import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { igToken } from "@/lib/meta/ig-token";
import { sendWhatsAppPlantilla } from "@/lib/meta/send-whatsapp-template";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// VIGÍA DE LLAVES DE META (pedido de Roy 24-nov-2026). El 23-nov Facebook
// reinició la sesión de Roy, la llave del bot murió y WhatsApp + Messenger
// pasaron horas fallando en silencio. Desde entonces WhatsApp usa una llave
// permanente (usuario del sistema vita-bot), pero la de Messenger sigue
// ligada a la sesión personal de Roy hasta que Meta apruebe pages_messaging.
// Cada 3 horas prueba las 3 llaves con una lectura (no manda nada) y si
// alguna murió avisa a Roy por WhatsApp + correo, máximo una vez al día.

const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";
const TIPO_LOG = "vigia-tokens";

type Prueba = { canal: string; ok: boolean; detalle: string };

async function probar(canal: string, url: string, token: string): Promise<Prueba> {
  if (!token) return { canal, ok: false, detalle: "no hay llave configurada" };
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.ok) return { canal, ok: true, detalle: "ok" };
    const j = await r.json().catch(() => ({}));
    const e = j?.error ?? {};
    return { canal, ok: false, detalle: `${r.status} code ${e.code ?? "?"}/${e.error_subcode ?? "-"}: ${String(e.message ?? "").slice(0, 160)}` };
  } catch (err) {
    // un error de red no es una llave muerta: no alarmar por eso
    return { canal, ok: true, detalle: `sin respuesta de Meta (${String(err).slice(0, 80)})` };
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pruebas = await Promise.all([
    probar(
      "Messenger",
      "https://graph.facebook.com/v21.0/me?fields=id",
      process.env.FB_PAGE_ACCESS_TOKEN || ""
    ),
    probar(
      "WhatsApp",
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=id`,
      process.env.WHATSAPP_ACCESS_TOKEN || ""
    ),
    probar("Instagram", "https://graph.instagram.com/v21.0/me?fields=id", await igToken()),
  ]);
  const caidas = pruebas.filter((p) => !p.ok);
  if (caidas.length === 0) return NextResponse.json({ ok: true, pruebas });

  console.error("Vigía de llaves: llave(s) caída(s):", caidas);
  const supabase = createAdminClient();

  // máximo un aviso al día mientras siga caída
  const hace20h = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data: previos } = await supabase
    .from("automatizaciones_log")
    .select("id")
    .eq("tipo", TIPO_LOG)
    .gte("creado_en", hace20h)
    .limit(1);
  if (previos && previos.length > 0) {
    return NextResponse.json({ ok: false, caidas, aviso: "ya se avisó en las últimas 20 h" });
  }

  const canales = caidas.map((c) => c.canal).join(" y ");
  const texto = `Se cayó la llave de ${canales} del bot: esos mensajes no están saliendo. Pídele a Claude que la renueve (5 min).`;

  // WhatsApp (si la caída es justo la de WhatsApp, esto falla y queda el correo)
  let okWa = false;
  try {
    await sendWhatsAppPlantilla(NUMERO_ROY, "aviso_sistema_vita", [texto]);
    okWa = true;
  } catch (e) {
    console.error("Vigía de llaves: aviso por WhatsApp falló:", e);
  }

  let okCorreo = false;
  try {
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const filas = caidas
        .map((c) => `<li><strong>${c.canal}</strong>: <code>${c.detalle.replace(/</g, "&lt;")}</code></li>`)
        .join("");
      await resend.emails.send({
        from: "Sistema VITA <contacto@vitarescue.com.mx>",
        to: "roymataparamedic@gmail.com",
        subject: `⚠️ Se cayó la llave de ${canales} del bot`,
        html: `<div style="max-width:540px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;">
<p>El vigía de llaves de Meta encontró una llave muerta. Mientras no se renueve, el bot no puede mandar mensajes por ese canal.</p>
<ul>${filas}</ul>
<p>Si dice <strong>code 190</strong>, Facebook cerró la sesión (cambio de contraseña o reinicio por seguridad). Pídele a Claude que saque una llave nueva y la ponga en Vercel.</p>
</div>`,
      });
      okCorreo = true;
    }
  } catch (e) {
    console.error("Vigía de llaves: aviso por correo falló:", e);
  }

  try {
    await supabase.from("automatizaciones_log").insert({
      tipo: TIPO_LOG,
      destinatario: "Roy (WhatsApp + correo)",
      resumen: texto.slice(0, 300),
      detalle: JSON.stringify(caidas).slice(0, 8000),
      exito: okWa || okCorreo,
    });
  } catch (e) {
    console.error("Vigía de llaves: no se pudo escribir el log:", e);
  }

  return NextResponse.json({ ok: false, caidas, avisos: { whatsapp: okWa, correo: okCorreo } });
}
