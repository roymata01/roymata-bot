import { NextRequest, NextResponse } from "next/server";
import { handleWebhookVerification } from "@/lib/meta/verify-webhook";
import { isValidMetaSignature } from "@/lib/meta/verify-signature";
import { parseWhatsAppPayload } from "@/lib/meta/parse-whatsapp";
import { processInboundMessage } from "@/lib/inbox/process-inbound-message";
import { normalizaTelMx } from "@/lib/meta/send-whatsapp-template";
import { createAdminClient } from "@/lib/supabase/admin";

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
      // opt-out: si el mensaje es "BAJA", se registra y no pasa al bot
      if (PALABRAS_BAJA.test(message.content ?? "")) {
        const tel = normalizaTelMx(message.externalId);
        if (tel) await createAdminClient().from("wa_optouts").upsert({ phone: tel }, { onConflict: "phone" });
        continue;
      }
      await processInboundMessage(message);
    }
  } catch (error) {
    console.error("Error procesando mensaje de WhatsApp:", error);
  }

  // Siempre 200 una vez validada la firma, para que Meta no reintente en bucle.
  return NextResponse.json({ received: true });
}
