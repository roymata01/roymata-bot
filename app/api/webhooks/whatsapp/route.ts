import { NextRequest, NextResponse } from "next/server";
import { handleWebhookVerification } from "@/lib/meta/verify-webhook";
import { isValidMetaSignature } from "@/lib/meta/verify-signature";
import { parseWhatsAppPayload } from "@/lib/meta/parse-whatsapp";
import { processInboundMessage } from "@/lib/inbox/process-inbound-message";

export function GET(req: NextRequest) {
  return handleWebhookVerification(req);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!isValidMetaSignature(rawBody, signature, process.env.META_APP_SECRET)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const messages = parseWhatsAppPayload(body);

  try {
    for (const message of messages) {
      await processInboundMessage(message);
    }
  } catch (error) {
    console.error("Error procesando mensaje de WhatsApp:", error);
  }

  // Siempre 200 una vez validada la firma, para que Meta no reintente en bucle.
  return NextResponse.json({ received: true });
}
