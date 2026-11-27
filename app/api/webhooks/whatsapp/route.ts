import { NextRequest, NextResponse, after } from "next/server";
import { handleWebhookVerification } from "@/lib/meta/verify-webhook";
import { isValidMetaSignature } from "@/lib/meta/verify-signature";
import { parseWhatsAppPayload } from "@/lib/meta/parse-whatsapp";
import { processInboundMessage } from "@/lib/inbox/process-inbound-message";
import { normalizaTelMx } from "@/lib/meta/send-whatsapp-template";
import { createAdminClient } from "@/lib/supabase/admin";
import { esRoy } from "@/lib/publicador/whatsapp-roy";
import { ingestInboundMessage } from "@/lib/inbox/ingest-inbound-message";

// El publicador (video → copys → "publicar") corre después de contestarle a
// Meta y puede tardar varios minutos subiendo a las redes.
export const maxDuration = 800;

export function GET(req: NextRequest) {
  return handleWebhookVerification(req);
}

// "BAJA"/"STOP"/"NO"/"cancelar" = opt-out de campañas de WhatsApp.
const PALABRAS_BAJA = /^\s*(baja|stop|no|cancelar|dar de baja|no más|no mas)\s*!?\.?\s*$/i;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!isValidMetaSignature(rawBody, signature, process.env.META_APP_SECRET)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // Acuses de entrega. Los fallos NO se ven en la respuesta de la API (Meta
  // contesta "accepted" y luego avisa por aquí), así que cuando un mensaje
  // falla se manda el error por correo — si no, se pierde en los logs.
  try {
    const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses;
    if (statuses) {
      console.log("WA status:", JSON.stringify(statuses).slice(0, 800));
      const fallidos = statuses.filter((s: { status?: string }) => s?.status === "failed");
      if (fallidos.length && process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Sistema VITA <contacto@vitarescue.com.mx>",
          to: "roymataparamedic@gmail.com",
          subject: "⚠️ Un WhatsApp del sistema no se pudo entregar",
          html: `<p>Meta rechazó la entrega de un mensaje. Detalle técnico:</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:12px;">${JSON.stringify(fallidos, null, 2).slice(0, 3000).replace(/</g, "&lt;")}</pre>`,
        });
      }
    }
  } catch (e) {
    console.error("WA status:", e);
  }

  const messages = parseWhatsAppPayload(body);

  try {
    for (const message of messages) {
      // PUBLICADOR (27-nov-2026): lo que Roy le manda al bot desde SU número
      // (videos, "publicar", cambios a los copys) se atiende aparte y en
      // segundo plano. Primero se guarda el mensaje (eso deduplica los
      // reintentos de Meta); si no era para el publicador, sigue normal.
      if (esRoy(message.externalId)) {
        const ingerido = await ingestInboundMessage(message);
        if (!ingerido) continue; // reintento de Meta: ya se atendió
        after(async () => {
          try {
            const { manejarMensajeRoy } = await import("@/lib/publicador/flujo");
            const atendido = await manejarMensajeRoy(message);
            // no era para el publicador: sigue el camino normal de la bandeja
            if (!atendido) await processInboundMessage(message, ingerido);
          } catch (e) {
            console.error("Publicador (mensaje de Roy):", e);
          }
        });
        continue;
      }
      // opt-out: si el mensaje es "BAJA", se registra y no pasa al bot
      if (PALABRAS_BAJA.test(message.content ?? "")) {
        const tel = normalizaTelMx(message.externalId);
        if (tel) await createAdminClient().from("wa_optouts").upsert({ phone: tel }, { onConflict: "phone" });
        continue;
      }
      await processInboundMessage(message);
      // Si es un cliente con cotización enviada, se registra en su hilo
      // (detiene el seguimiento) y se le avisa a Roy a su WhatsApp personal.
      const { avisarRespuestaCotizacionWA } = await import("@/lib/cotizador/respuesta-wa");
      await avisarRespuestaCotizacionWA(message.externalId, message.content ?? "");
    }
  } catch (error) {
    console.error("Error procesando mensaje de WhatsApp:", error);
  }

  // Siempre 200 una vez validada la firma, para que Meta no reintente en bucle.
  return NextResponse.json({ received: true });
}
