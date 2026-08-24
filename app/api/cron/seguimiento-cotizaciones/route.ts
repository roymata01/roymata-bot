import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { pendientesDeHoy, filtrar, redactar, porWhatsApp } from "@/lib/cotizador/seguimiento";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Cron diario (9:00 hora de México): le da seguimiento a las cotizaciones
// enviadas que el cliente no ha contestado, a los 3, 7 y 14 días.
//
// Se detiene solo cuando el cliente responde, cuando Roy marca ganada/perdida
// o cuando apaga el seguimiento de esa cotización. Cada recordatorio sale en
// el MISMO hilo de correo, para que el cliente vea la conversación completa.
//
// ?prueba=1 no manda nada: devuelve a quién le tocaría hoy. Sirve para revisar
// antes de dejarlo suelto.

const TOPE_POR_CORRIDA = 25; // freno de mano ante cualquier error de fechas

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const esCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!esCron) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const prueba = new URL(req.url).searchParams.get("prueba") === "1";
  const supabase = createAdminClient();

  const [cots, correos, hechos, sols] = await Promise.all([
    supabase.from("cotizaciones_emitidas").select("id, folio, dirigida, num_personas, total, estado, seguimiento_pausado, quote_request_id"),
    supabase.from("cotizacion_correos").select("cotizacion_id, folio, direction, to_email, created_at"),
    supabase.from("cotizacion_seguimientos").select("cotizacion_id, paso"),
    supabase.from("quote_requests").select("id, etapa, nombre, organizacion, telefono, num_personas"),
  ]);

  if (cots.error || correos.error || hechos.error || sols.error) {
    const cual = cots.error || correos.error || hechos.error || sols.error;
    return NextResponse.json({ error: `Base de datos: ${cual?.message}` }, { status: 500 });
  }

  const candidatos = pendientesDeHoy({
    cotizaciones: cots.data ?? [],
    correos: correos.data ?? [],
    hechos: hechos.data ?? [],
    solicitudes: sols.data ?? [],
  });
  const { envios: pendientes, bloqueados } = filtrar(candidatos);
  // Las que salieron por chat: el motor no les escribe, pero Roy debe verlas.
  const porChat = porWhatsApp({
    cotizaciones: cots.data ?? [], correos: correos.data ?? [], solicitudes: sols.data ?? [],
  });

  if (prueba) {
    return NextResponse.json({
      prueba: true,
      total: pendientes.length,
      bloqueados,
      por_whatsapp: porChat,
      envios: pendientes.map((p) => ({
        folio: `S${p.cotizacion.folio}`,
        para: p.cotizacion.dirigida,
        destino: p.destino,
        paso: p.paso,
        dias_desde_envio: p.diasDesdeEnvio,
        asunto: redactar(p).asunto,
      })),
    });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Falta RESEND_API_KEY" }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const enviados: string[] = [];
  const fallos: string[] = [];

  for (const p of pendientes.slice(0, TOPE_POR_CORRIDA)) {
    const c = p.cotizacion;
    const { asunto, html, texto } = redactar(p);
    try {
      const { data, error } = await resend.emails.send({
        from: "VITA RESCUE <contacto@vitarescue.com.mx>",
        to: p.destino,
        replyTo: `cotizacion-s${c.folio}@respuestas.vitarescue.com.mx`,
        // Mismo ancla que la cotización original: el cliente lo ve como un
        // seguimiento del hilo, no como un correo suelto de la nada.
        headers: {
          References: `<cotizacion-s${c.folio}@vitarescue.com.mx>`,
          "In-Reply-To": `<cotizacion-s${c.folio}@vitarescue.com.mx>`,
        },
        subject: asunto,
        html,
      });
      if (error) throw new Error(error.message);

      // Se anota ANTES que nada más: si el registro falla, el siguiente cron
      // lo repetiría, y un cliente recibiendo el mismo correo dos veces es
      // peor que un seguimiento perdido.
      const { error: regErr } = await supabase.from("cotizacion_seguimientos").insert({
        cotizacion_id: c.id, folio: c.folio, paso: p.paso,
        to_email: p.destino, resend_id: data?.id ?? null,
      });
      if (regErr) throw new Error(`enviado pero no registrado: ${regErr.message}`);

      // También al hilo del CRM, para que Roy vea el seguimiento junto al resto.
      await supabase.from("cotizacion_correos").insert({
        cotizacion_id: c.id, folio: c.folio, direction: "out",
        from_email: "contacto@vitarescue.com.mx", to_email: p.destino,
        subject: asunto, body_text: texto,
      });
      enviados.push(`S${c.folio} paso ${p.paso} → ${c.dirigida ?? p.destino}`);
    } catch (e) {
      fallos.push(`S${c.folio}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Resumen a Roy, solo si hubo movimiento: un correo diario de "no hice nada"
  // se vuelve ruido y se deja de leer.
  if ((enviados.length || fallos.length || bloqueados.length || porChat.length) && process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: "Sistema VITA <contacto@vitarescue.com.mx>",
        to: "roymataparamedic@gmail.com",
        subject: `📨 Seguimiento enviado a ${enviados.length} cotización${enviados.length === 1 ? "" : "es"}`,
        html: `<div style="max-width:540px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;">
<p>Hoy salieron estos recordatorios de cotizaciones sin respuesta:</p>
<ul>${enviados.map((t) => `<li>${t}</li>`).join("")}</ul>
${fallos.length ? `<p style="color:#b91c1c;"><strong>No se pudieron mandar:</strong></p><ul>${fallos.map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}
${bloqueados.length ? `<p><strong>Estas las detuve a propósito:</strong></p><ul>${bloqueados.map((b) => `<li>S${b.folio} (${b.dirigida ?? b.destino}) — ${b.motivo}${b.sugerencia ? `. ¿Será <strong>${b.sugerencia}</strong>?` : ""}</li>`).join("")}</ul>` : ""}
${porChat.length ? `<p style="margin-top:20px;"><strong>Estas te toca escribirlas a ti</strong> (llegaron por chat, no tienen correo):</p>
<ul>${porChat.map((w) => `<li>S${w.folio} — ${w.quien}${w.total ? ` · $${Number(w.total).toLocaleString("es-MX")}` : ""}${w.link ? ` · <a href="${w.link}">abrir WhatsApp con el mensaje listo →</a>` : " · sin teléfono"}</li>`).join("")}</ul>` : ""}
<p style="color:#777;font-size:13px;">Si alguien contesta, el seguimiento de esa cotización se detiene solo.</p>
<p><a href="https://cursos.vitarescue.com.mx/admin/cotizaciones" style="display:inline-block;background:#1a56db;color:#fff;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none;">Abrir Cotizaciones →</a></p>
</div>`,
      });
    } catch (e) {
      console.error("Resumen del seguimiento:", e);
    }
  }

  return NextResponse.json({ ok: true, evaluadas: pendientes.length, enviados, fallos, bloqueados, por_whatsapp: porChat.length });
}
