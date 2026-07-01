import { NextRequest, NextResponse } from "next/server";
import { handleWebhookVerification } from "@/lib/meta/verify-webhook";

export function GET(req: NextRequest) {
  return handleWebhookVerification(req);
}

export async function POST(req: NextRequest) {
  // TODO Fase 2: validar X-Hub-Signature-256, guardar el mensaje en Supabase
  // (idempotente vía processed_webhook_events) y disparar la respuesta de IA.
  await req.json().catch(() => null);
  return NextResponse.json({ received: true });
}
