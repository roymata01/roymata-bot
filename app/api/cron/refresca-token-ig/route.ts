import { NextRequest, NextResponse } from "next/server";
import { igToken, guardarIgToken } from "@/lib/meta/ig-token";
import { sendWhatsAppPlantilla } from "@/lib/meta/send-whatsapp-template";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron SEMANAL: renueva el token largo de Instagram antes de que caduque
// (duran 60 días y solo se refrescan mientras siguen vivos). Si el refresh
// falla, avisa a Roy por WhatsApp Y correo — que no vuelva a morir en
// silencio como en agosto-2026.

const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const actual = await igToken();
  if (!actual) return NextResponse.json({ ok: false, nota: "No hay token que refrescar." });

  try {
    const r = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${actual}`
    );
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      throw new Error(JSON.stringify(data.error ?? data).slice(0, 300));
    }
    await guardarIgToken(data.access_token, "refresh automático semanal");
    return NextResponse.json({ ok: true, expira_en_dias: Math.round((data.expires_in ?? 0) / 86400) });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("Refresh del token de IG FALLÓ:", detalle);

    // Alerta doble: WhatsApp (lo que Roy sí ve) + correo con el detalle
    await sendWhatsAppPlantilla(NUMERO_ROY, "alerta_cotizacion", [
      "⚠️ Token de Instagram del bot",
      "la renovación automática falló — sin atenderlo, el bot quedará mudo en IG",
    ]).catch(() => {});
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: "Sistema VITA <contacto@vitarescue.com.mx>",
          to: "roymataparamedic@gmail.com",
          subject: "⚠️ El token de Instagram del bot no se pudo renovar",
          html: `<p>El refresh semanal del token de Instagram falló. Si no se atiende, el bot dejará de responder DMs de IG cuando el token caduque.</p>
<p><strong>Cómo renovarlo a mano:</strong> developers.facebook.com → app VitaRescue Bot → Instagram → API setup with Instagram login → Generate token → pasárselo a Claude para actualizarlo.</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:8px;font-size:12px;">${detalle.replace(/</g, "&lt;")}</pre>`,
        });
      }
    } catch {}
    return NextResponse.json({ ok: false, error: detalle.slice(0, 200) }, { status: 500 });
  }
}
