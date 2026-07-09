import { NextRequest, NextResponse } from "next/server";
import { handleWebhookVerification } from "@/lib/meta/verify-webhook";
import { isValidMetaSignature } from "@/lib/meta/verify-signature";
import { parseMessagingWebhook } from "@/lib/meta/parse-messaging-webhook";
import { parseInstagramCommentWebhook } from "@/lib/meta/parse-comment-webhook";
import { processInboundMessage } from "@/lib/inbox/process-inbound-message";
import { handleInstagramComment } from "@/lib/inbox/handle-instagram-comment";

export function GET(req: NextRequest) {
  return handleWebhookVerification(req);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  // La API de Instagram con "Instagram Login" firma sus webhooks con su propio
  // App Secret de Instagram, distinto al App Secret general de la app de Facebook.
  if (!isValidMetaSignature(rawBody, signature, process.env.INSTAGRAM_APP_SECRET)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const messages = parseMessagingWebhook(body, "instagram");
  const comments = parseInstagramCommentWebhook(body);

  try {
    for (const message of messages) {
      await processInboundMessage(message);
    }
    for (const comment of comments) {
      await handleInstagramComment(comment);
    }
  } catch (error) {
    console.error("Error procesando mensaje de Instagram:", error);
  }

  return NextResponse.json({ received: true });
}
