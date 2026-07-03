import type { Channel } from "@/types/database";
import type { InboundMessage } from "@/lib/meta/types";

// Formato compartido por Instagram Messaging API y Messenger Platform:
// https://developers.facebook.com/docs/messenger-platform/webhooks
export function parseMessagingWebhook(
  body: unknown,
  channel: Extract<Channel, "instagram" | "messenger">
): InboundMessage[] {
  const results: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries as Record<string, unknown>[]) {
    const messaging = (entry.messaging as Record<string, unknown>[]) ?? [];

    for (const event of messaging) {
      const message = event.message as Record<string, unknown> | undefined;
      if (!message) continue;

      // Un eco es un mensaje enviado por NUESTRA cuenta (Roy desde la app, el panel o la IA).
      // Se guarda como saliente para que la conversación se vea completa; los que ya
      // guardamos nosotros (panel/IA) chocan por mid duplicado y se descartan solos.
      const isEcho = Boolean(message.is_echo);

      const attachments = message.attachments as Record<string, unknown>[] | undefined;
      const firstAttachment = attachments?.[0];
      const attachmentPayload = firstAttachment?.payload as
        | Record<string, unknown>
        | undefined;

      // En un eco, el cliente es el destinatario; en un mensaje normal, el remitente.
      const counterpart = (isEcho ? event.recipient : event.sender) as Record<string, unknown>;

      results.push({
        channel,
        externalId: counterpart.id as string,
        displayName: null, // requiere una llamada aparte a la Graph API para el perfil
        content: (message.text as string) ?? null,
        mediaUrl: (attachmentPayload?.url as string) ?? null,
        mediaType: (firstAttachment?.type as string) ?? null,
        metaMessageId: message.mid as string,
        timestamp: new Date(Number(event.timestamp)).toISOString(),
        raw: event,
        isEcho,
      });
    }
  }

  return results;
}
