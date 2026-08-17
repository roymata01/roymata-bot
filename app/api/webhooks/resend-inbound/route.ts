import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Buzón de dos vías por cotización (Resend Inbound, respuestas.vitarescue.com.mx).
// Todo lo que toca la dirección cotizacion-s<folio>@respuestas... entra aquí:
//  - Si escribe el CLIENTE → se guarda como "in" en el hilo y se le manda copia
//    a Roy a su Gmail, con reply-to del MISMO folio (no del cliente) para que su
//    respuesta desde Gmail vuelva a pasar por aquí.
//  - Si escribe ROY (desde su Gmail) → se guarda como "out" y se REENVÍA al
//    cliente desde contacto@vitarescue.com.mx. Así puede contestar desde el
//    correo o desde el panel, y en ambos casos queda registrado.
// Todos los correos del folio llevan el mismo encabezado References, para que
// Gmail los agrupe en UNA sola conversación.
// Seguridad: la URL del webhook lleva ?key=<CRON_SECRET> (se configura así en
// el dashboard de Resend). Webhooks reintentados se dedupean por resend_id.

// Direcciones desde las que escribe Roy (no son clientes)
const ROY = ["roymataparamedic@gmail.com", "contacto@vitarescue.com.mx"];
const anclaHilo = (folio: number | null) => (folio ? `<cotizacion-s${folio}@vitarescue.com.mx>` : undefined);
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

  const remitente = (de.match(/<([^>]+)>/)?.[1] || de).toLowerCase().trim();
  const esRoy = ROY.some((e) => remitente.includes(e));

  // Si escribe Roy, el destinatario real es el cliente: el último que escribió
  // en este folio, o el correo de la solicitud original.
  let cliente: string | null = null;
  if (esRoy && folio) {
    const { data: previos } = await supabase
      .from("cotizacion_correos")
      .select("from_email, to_email, direction")
      .eq("folio", folio)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const m of previos ?? []) {
      const candidato = m.direction === "in"
        ? (m.from_email.match(/<([^>]+)>/)?.[1] || m.from_email).toLowerCase().trim()
        : (m.to_email || "").toLowerCase().trim();
      if (candidato && !ROY.some((e) => candidato.includes(e))) { cliente = candidato; break; }
    }
    if (!cliente && cotizacionId) {
      const { data: cot } = await supabase
        .from("cotizaciones_emitidas")
        .select("quote_request_id")
        .eq("id", cotizacionId)
        .maybeSingle();
      if (cot?.quote_request_id) {
        const { data: qr } = await supabase.from("quote_requests").select("correo").eq("id", cot.quote_request_id).maybeSingle();
        cliente = qr?.correo?.toLowerCase().trim() || null;
      }
    }
  }

  const { error: insErr } = await supabase.from("cotizacion_correos").insert({
    cotizacion_id: cotizacionId,
    folio,
    direction: esRoy ? "out" : "in",
    from_email: de.slice(0, 200),
    to_email: (esRoy ? cliente || para : para).slice(0, 200),
    subject: asunto.slice(0, 300),
    body_text: (correo.text || "").slice(0, 20000) || null,
    body_html: (correo.html || "").slice(0, 100000) || null,
    resend_id: emailId,
  });
  if (insErr && !insErr.message.includes("duplicate")) console.error("Inbound insert:", insErr.message);
  const duplicado = !!insErr?.message.includes("duplicate");

  // Entrega (solo la primera vez, no en reintentos del webhook)
  if (!duplicado) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const ancla = anclaHilo(folio);
    const headers = ancla ? { References: ancla, "In-Reply-To": ancla } : undefined;
    const cuerpo = correo.html || `<pre style="font-family:inherit;white-space:pre-wrap;">${(correo.text || "").replace(/</g, "&lt;")}</pre>`;
    try {
      if (esRoy && cliente) {
        // Roy contestó desde su correo → se lo mandamos al cliente
        await resend.emails.send({
          from: "VITA RESCUE <contacto@vitarescue.com.mx>",
          to: cliente,
          replyTo: folio ? `cotizacion-s${folio}@respuestas.vitarescue.com.mx` : undefined,
          subject: asunto.replace(/^\s*\[[^\]]*\]\s*/, ""),
          html: cuerpo,
          headers,
        });
      } else if (!esRoy) {
        // Escribió el cliente → copia a Roy, con responder ligado al folio
        await resend.emails.send({
          from: "Instituto VITA <contacto@vitarescue.com.mx>",
          to: "roymataparamedic@gmail.com",
          replyTo: folio ? `cotizacion-s${folio}@respuestas.vitarescue.com.mx` : undefined,
          subject: asunto,
          html: `<p style="color:#777;font-size:13px;margin:0 0 12px;">${folio ? `Respuesta del cliente a la cotización S${folio}` : "Respuesta de cliente"} · ${remitente}<br/>Contesta este correo normalmente: tu respuesta le llega a él y queda en el panel.</p>${cuerpo}`,
          headers,
        });
      }
    } catch (e) {
      console.error("Inbound: fallo la entrega:", e);
    }
  }

  return NextResponse.json({ ok: true, folio, ligado: !!cotizacionId, de: esRoy ? "roy" : "cliente", cliente, duplicado });
}
