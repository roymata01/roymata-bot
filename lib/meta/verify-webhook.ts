import { NextRequest, NextResponse } from "next/server";

// Responde al challenge de verificación que Meta manda al registrar un webhook (GET).
// Los 3 canales (WhatsApp, Instagram, Messenger) usan el mismo WHATSAPP_VERIFY_TOKEN.
export function handleWebhookVerification(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Token de verificación inválido" }, { status: 403 });
}
