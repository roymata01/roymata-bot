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

  // registro temporal de acuses de entrega/error para diagnóstico
  try {
    const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses;
    if (statuses) console.log("WA status:", JSON.stringify(statuses).slice(0, 800));
  } catch {}

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
