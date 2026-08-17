import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Recepción de correos (Resend Inbound, dominio respuestas.vitarescue.com.mx).
// Cada cotización sale con reply-to cotizacion-s<folio>@respuestas... — cuando
// el cliente responde, Resend manda aquí el evento `email.received`:
//  1. se pide el cuerpo completo a la API de Resend (el webhook solo trae metadatos)
//  2. se liga a la cotización por el folio del destinatario y se guarda el hilo
//  3. se reenvía una copia al Gmail de Roy con reply-to del cliente, para que
//     también lo vea (y pueda contestar) desde su correo de diario.
// Seguridad: la URL del webhook lleva ?key=<CRON_SECRET> (se configura así en
// el dashboard de Resend). Webhooks reintentados se dedupean por resend_id.
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.nextUrl.searchParams.get("key") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const evento = await req.json().catch(() => null);
  if (evento?.type !== "email.received") return NextResponse.json({ ok: true, ignorado: evento?.type ?? "sin tipo" });

  const emailId: string | undefined = evento?.data?.email_id || evento?.data?.id;
  if (!emailId) return NextResponse.json({ ok: true, ignorado: "sin email_id" });

  // Cuerpo completo del correo recibido
  const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!r.ok) {
    console.error("Inbound: no pude leer el correo recibido", emailId, r.status);
    // 200 igual: si Resend reintenta y el correo ya no existe, no queremos loop
    return NextResponse.json({ ok: false, error: `lectura ${r.status}` });
  }
  const correo = await r.json();
  const de: string = correo.from || evento?.data?.from || "desconocido";
  const para: string = Array.isArray(correo.to) ? correo.to.join(", ") : String(correo.to || "");
  const asunto: string = correo.subject || evento?.data?.subject || "(sin asunto)";

  // Ligar a la cotización por el destinatario cotizacion-s<folio>@...
  const supabase = createAdminClient();
  const folioMatch = `${para} ${de}`.match(/cotizacion-s?(\d{4,6})@/i) || asunto.match(/S(\d{4,6})/);
  let cotizacionId: string | null = null;
  let folio: number | null = null;
  if (folioMatch) {
    folio = Number(folioMatch[1]);
    const { data: cot } = await supabase.from("cotizaciones_emitidas").select("id").eq("folio", folio).maybeSingle();
    cotizacionId = cot?.id ?? null;
  }

  const { error: insErr } = await supabase.from("cotizacion_correos").insert({
    cotizacion_id: cotizacionId,
    folio,
    direction: "in",
    from_email: de.slice(0, 200),
    to_email: para.slice(0, 200),
    subject: asunto.slice(0, 300),
    body_text: (correo.text || "").slice(0, 20000) || null,
    body_html: (correo.html || "").slice(0, 100000) || null,
    resend_id: emailId,
  });
  if (insErr && !insErr.message.includes("duplicate")) console.error("Inbound insert:", insErr.message);
  const duplicado = insErr?.message.includes("duplicate");

  // Copia a la bandeja normal de Roy (solo la primera vez, no en reintentos)
  if (!duplicado) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const remitente = de.match(/<([^>]+)>/)?.[1] || de;
      await resend.emails.send({
        from: "Instituto VITA <contacto@vitarescue.com.mx>",
        to: "roymataparamedic@gmail.com",
        replyTo: remitente,
        subject: `${folio ? `[Respuesta cotización S${folio}] ` : "[Respuesta] "}${asunto}`,
        html: correo.html || `<pre style="font-family:inherit;white-space:pre-wrap;">${(correo.text || "").replace(/</g, "&lt;")}</pre>`,
      });
    } catch (e) {
      console.error("Inbound: fallo la copia a contacto@:", e);
    }
  }

  return NextResponse.json({ ok: true, folio, ligado: !!cotizacionId, duplicado: !!duplicado });
}
