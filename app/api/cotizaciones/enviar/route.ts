import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";

export const maxDuration = 60;

// Envía una cotización ya generada (previa aprobación de Roy en el panel):
// - via "correo": Resend con el PDF adjunto, desde contacto@vitarescue.com.mx
// - via "chat": mensaje con el link del PDF por la MISMA conversación
//   (WhatsApp/IG/Messenger) de donde salió la solicitud; queda en la bandeja.
export async function POST(req: NextRequest) {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  const auth = req.headers.get("authorization");
  const conLlave = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!user && !conLlave) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { cotizacion_id, via, correo } = await req.json().catch(() => ({}));
  if (!cotizacion_id || !["correo", "chat"].includes(via)) {
    return NextResponse.json({ error: "Faltan cotizacion_id o via (correo|chat)." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: cot } = await supabase
    .from("cotizaciones_emitidas")
    .select("*")
    .eq("id", cotizacion_id)
    .maybeSingle();
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });

  if (via === "correo") {
    const destino = String(correo || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
      return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Falta RESEND_API_KEY en el entorno." }, { status: 500 });
    }
    const pdfRes = await fetch(cot.pdf_url);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: mailErr } = await resend.emails.send({
      from: "VITA RESCUE <contacto@vitarescue.com.mx>",
      to: destino,
      subject: `Cotización S${cot.folio} — Curso de primeros auxilios · VITA RESCUE`,
      attachments: [{ filename: `Cotizacion-S${cot.folio}-VITA-RESCUE.pdf`, content: pdfBuf }],
      html: `
        <div style="max-width:540px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;">
          <p>Hola ${cot.dirigida},</p>
          <p>Gracias por tu interés en nuestros cursos. Te adjunto la cotización
          <strong>S${cot.folio}</strong> del curso de primeros auxilios básicos para
          <strong>${cot.num_personas} persona${cot.num_personas === 1 ? "" : "s"}</strong>.</p>
          <p>La cotización tiene una vigencia de 30 días. Cualquier duda o ajuste,
          responde este correo o escríbenos por WhatsApp — con gusto mejoramos presupuestos.</p>
          <p style="margin-top:24px;">TUM I. Rodrigo Mata Santillana<br />
          <span style="color:#777;font-size:13px;">Director VITA RESCUE · "Aprender, Aplicar, Salvar"</span></p>
        </div>`,
    });
    if (mailErr) {
      console.error("Error enviando cotización por correo:", mailErr);
      return NextResponse.json({ error: "El correo no se pudo enviar." }, { status: 502 });
    }
  }

  if (via === "chat") {
    if (!cot.quote_request_id) {
      return NextResponse.json({ error: "Esta cotización no está ligada a una conversación." }, { status: 400 });
    }
    const { data: qr } = await supabase
      .from("quote_requests")
      .select("conversation_id")
      .eq("id", cot.quote_request_id)
      .maybeSingle();
    if (!qr?.conversation_id) {
      return NextResponse.json({ error: "No encontré la conversación de esta solicitud." }, { status: 404 });
    }
    const { data: conversation } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("id", qr.conversation_id)
      .single();
    if (!conversation) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });

    const texto = `Listo! Aquí está tu cotización S${cot.folio} del curso de primeros auxilios para ${cot.num_personas} persona${cot.num_personas === 1 ? "" : "s"} 📋\n\n${cot.pdf_url}\n\nCualquier duda o ajuste me dices con confianza. La cotización tiene vigencia de 30 días.`;

    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: qr.conversation_id,
        contact_id: conversation.contact_id,
        channel: conversation.channel,
        direction: "out",
        sender_type: "human",
        sender_user_id: user?.id || null,
        content: texto,
      })
      .select()
      .single();
    if (insertError) {
      console.error("Error guardando mensaje de cotización:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    try {
      const metaId = await sendForChannel(conversation.channel, conversation.contact.external_id, texto);
      await supabase.from("messages").update({ status: "sent", meta_message_id: metaId }).eq("id", message.id);
    } catch (err) {
      console.error("Error enviando cotización por chat:", err);
      await supabase.from("messages").update({ status: "failed" }).eq("id", message.id);
      return NextResponse.json({ error: "No se pudo enviar por el chat (¿ventana de 24h cerrada?)." }, { status: 502 });
    }
  }

  // Marcar enviada + la solicitud como atendida
  const vias = Array.from(new Set([...(cot.enviada_por || []), via]));
  await supabase
    .from("cotizaciones_emitidas")
    .update({ estado: "enviada", enviada_por: vias })
    .eq("id", cot.id);
  if (cot.quote_request_id) {
    await supabase.from("quote_requests").update({ status: "atendida" }).eq("id", cot.quote_request_id);
  }

  return NextResponse.json({ ok: true, via });
}
