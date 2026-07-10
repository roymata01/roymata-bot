import { NextRequest, NextResponse } from "next/server";
import { handleWebhookVerification } from "@/lib/meta/verify-webhook";
import { isValidMetaSignature } from "@/lib/meta/verify-signature";
import { parseMessagingWebhook } from "@/lib/meta/parse-messaging-webhook";
import { parseFacebookCommentWebhook } from "@/lib/meta/parse-feed-comment-webhook";
import { processInboundMessage } from "@/lib/inbox/process-inbound-message";
import { handleFacebookComment } from "@/lib/inbox/handle-facebook-comment";

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
  const messages = parseMessagingWebhook(body, "messenger");
  const comments = parseFacebookCommentWebhook(body);

  try {
    for (const message of messages) {
      await processInboundMessage(message);
    }
    for (const comment of comments) {
      await handleFacebookComment(comment);
    }
  } catch (error) {
    console.error("Error procesando mensaje de Messenger:", error);
  }

  return NextResponse.json({ received: true });
}
