import { NextRequest, NextResponse, after } from "next/server";
import { handleWebhookVerification } from "@/lib/meta/verify-webhook";
import { isValidMetaSignature } from "@/lib/meta/verify-signature";
import { parseMessagingWebhook } from "@/lib/meta/parse-messaging-webhook";
import { parseInstagramCommentWebhook } from "@/lib/meta/parse-comment-webhook";
import { processInboundMessage } from "@/lib/inbox/process-inbound-message";
import { handleInstagramComment } from "@/lib/inbox/handle-instagram-comment";

// Las respuestas llevan pausas humanas (hasta ~20s entre burbujas), así que se
// le responde 200 a Meta de inmediato y el trabajo sigue en segundo plano.
export const maxDuration = 120;

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

  after(async () => {
    try {
      for (const message of messages) {
        await processInboundMessage(message);
      }
      for (const comment of comments) {
        // pausa humana antes de la invitación: nadie contesta un comentario en 2s
        await new Promise((r) => setTimeout(r, 8000 + Math.random() * 7000));
        await handleInstagramComment(comment);
      }
    } catch (error) {
      console.error("Error procesando mensaje de Instagram:", error);
    }
  });

  return NextResponse.json({ received: true });
}
